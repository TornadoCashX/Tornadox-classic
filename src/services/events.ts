// @ts-check

import graph from '@/services/graph'
import { download } from '@/services/runtimeAssets'
import { getRuntimeIndexedDB } from '@/services/runtimeStorage'
import { reportEventProgress } from '@/services/runtimeProgress'
import networkConfig, { enabledChains, blockSyncInterval } from '@/networkConfig'
import InstanceABI from '@/abis/Instance.abi.json'
import { eventsType, httpConfig } from '@/constants'
import { createRpcClient, readEventLogs } from '@/lib/eventLogs'
import { sleep, flattenNArray, formatEvents, normalizeEvent, capitalizeFirstLetter } from '@/utils'
import {
  createBlockRanges,
  getPersistedEventCursor,
  clampEventCursor,
  mergeEventStreams
} from '@/services/eventSync'

const hasCompleteDepositPrefix = (events) => {
  if (!events.length) return false
  const indexes = events.map((event) => Number(event.leafIndex)).sort((a, b) => a - b)
  return indexes.every((leafIndex, index) => leafIndex === index)
}

type EventType = typeof eventsType.DEPOSIT | typeof eventsType.WITHDRAWAL | string
type EventRecord = Record<string, any>
type EventsResult = { events: EventRecord[]; lastBlock: number | string }
type EventFactoryMethods = {
  getBlockNumber: () => Promise<number>
  getPastEvents: (
    address: string,
    eventName: string,
    params: { fromBlock: number; toBlock: number | 'latest'; filter?: Record<string, unknown> }
  ) => Promise<EventRecord[]>
}

export class EventService {
  idb: any
  netId: number
  amount: string | number
  currency: string
  factoryMethods: EventFactoryMethods
  contractAddress: string
  isNative: boolean
  hasCache: boolean

  constructor({ netId, amount, currency, factoryMethods }) {
    this.idb = getRuntimeIndexedDB(netId)

    const { nativeCurrency } = networkConfig[`netId${netId}`]
    const hasCache = enabledChains.includes(netId.toString())

    this.netId = netId
    this.amount = amount
    this.currency = currency

    this.factoryMethods = factoryMethods
    this.contractAddress = this.getContractAddress({ netId, amount, currency })

    this.isNative = nativeCurrency === this.currency
    // Static event bundles exist for both native and ERC-20 pools. Restricting this to the
    // native currency made restored token withdrawals skip their bundled history and fall back
    // to a full Graph/RPC sync from the deployment block.
    this.hasCache = hasCache
  }

  getInstanceName(type: EventType) {
    return `${type}s_${this.netId}_${this.currency}_${this.amount}`
  }

  updateEventProgress(percentage: number, type: EventType) {
    reportEventProgress({ percentage, type })
  }

  async getEvents(type: EventType): Promise<EventsResult | undefined> {
    let cachedEvents = await this.getEventsFromDB(type)

    if (!cachedEvents && this.hasCache) {
      cachedEvents = await this.getEventsFromCache(type)
    }

    return cachedEvents
  }

  async updateEvents(type: EventType, cachedEvents?: EventsResult): Promise<EventsResult> {
    const { deployedBlock } = networkConfig[`netId${this.netId}`]

    const savedEvents = cachedEvents || (await this.getEvents(type))

    let fromBlock = deployedBlock

    if (savedEvents?.lastBlock !== '' && savedEvents?.lastBlock != null) {
      fromBlock = Number(savedEvents.lastBlock) + 1
    }

    const newEvents = await this.getEventsFromBlock({
      type,
      fromBlock,
      graphMethod: `getAll${capitalizeFirstLetter(type)}s`
    })

    if (!newEvents) {
      throw new Error('rpcIsDown')
    }

    const allEvents = mergeEventStreams(savedEvents?.events || [], newEvents.events || [])
      .map((event) => normalizeEvent(event, type))
      .filter((event) => event !== null)
      .sort((a, b) => {
        if (a.leafIndex != null && b.leafIndex != null) {
          return a.leafIndex - b.leafIndex
        }
        return a.blockNumber - b.blockNumber
      })

    if (!allEvents.length && newEvents.events?.length) {
      throw new Error('rpcIsDown')
    }

    const lastBlock =
      [newEvents.lastBlock, savedEvents?.lastBlock, deployedBlock].map(Number).find(Number.isFinite) ?? deployedBlock

    await this.saveEvents({ events: allEvents, lastBlock, type })

    return {
      events: allEvents,
      lastBlock
    }
  }
  async findEvent({ eventName, eventToFind, type }) {
    const instanceName = this.getInstanceName(type)

    let event = await this.idb.getFromIndex({
      storeName: instanceName,
      indexName: eventName,
      key: eventToFind
    })

    event = normalizeEvent(event, type)
    if (event) {
      return event
    }

    const savedEvents = await this.getEvents(type)
    let cachedThroughBlock = Number(savedEvents?.lastBlock)
    if (savedEvents) {
      event = savedEvents.events.map((event) => normalizeEvent(event, type)).find((event) => event?.[eventName] === eventToFind)
      if (event) {
        return event
      }
    }

    if (this.hasCache) {
      const cachedEvents = await this.getEventsFromCache(type)
      const staticCacheLastBlock = Number(cachedEvents?.lastBlock)
      if (Number.isFinite(staticCacheLastBlock)) {
        cachedThroughBlock = Number.isFinite(cachedThroughBlock)
          ? Math.max(cachedThroughBlock, staticCacheLastBlock)
          : staticCacheLastBlock
      }
      event = cachedEvents?.events.map((event) => normalizeEvent(event, type)).find((event) => event?.[eventName] === eventToFind)
      if (event) {
        return event
      }
    }

    event = await this.findIndexedDepositEvent({
      eventName,
      eventToFind,
      type,
      fromBlock: Number.isFinite(cachedThroughBlock) ? cachedThroughBlock + 1 : undefined
    })
    if (event) {
      return event
    }

    // The indexed Deposit query covered every block after the newest trusted cache cursor.
    // A second unfiltered update over the same range cannot find this commitment and only
    // duplicates RPC traffic for an invalid note.
    if (type === eventsType.DEPOSIT && eventName === 'commitment') {
      return undefined
    }

    const freshEvents = await this.updateEvents(type, savedEvents)
    event = freshEvents?.events.map((event) => normalizeEvent(event, type)).find((event) => event?.[eventName] === eventToFind)

    return event
  }

  async findIndexedDepositEvent({ eventName, eventToFind, type, fromBlock: requestedFromBlock }) {
    if (type !== eventsType.DEPOSIT || eventName !== 'commitment') {
      return undefined
    }

    const { deployedBlock } = networkConfig[`netId${this.netId}`]
    const currentBlockNumber = await this.factoryMethods.getBlockNumber()
    const minimumBlock = Math.max(deployedBlock, Number(requestedFromBlock) || deployedBlock)

    for (let toBlock = currentBlockNumber; toBlock >= minimumBlock; toBlock -= blockSyncInterval) {
      const fromBlock = Math.max(minimumBlock, toBlock - blockSyncInterval + 1)
      const events = await this.factoryMethods.getPastEvents(this.contractAddress, 'Deposit', {
        filter: { commitment: eventToFind },
        fromBlock,
        toBlock
      })
      const [event] = formatEvents(events, type)
      if (event) return event
    }

    return undefined
  }

  getContractAddress({ netId, amount, currency }) {
    const config = networkConfig[`netId${netId}`]
    return config.tokens[currency].instanceAddress[amount]
  }

  async getEventsFromCache(type: EventType): Promise<EventsResult | undefined> {
    try {
      const instanceName = this.getInstanceName(type)
      const module = await download({
        name: `events/${instanceName}.json.gz`
      })

      if (module) {
        const events = JSON.parse(module.toString())

        return {
          events,
          lastBlock: events.length ? events[events.length - 1].blockNumber : ''
        }
      }

      return {
        events: [],
        lastBlock: ''
      }
    } catch (err) {
      return undefined
    }
  }

  async getEventsFromDB(type: EventType): Promise<EventsResult | undefined> {
    try {
      const instanceName = this.getInstanceName(type)
      const [savedEvents, lastEvent] = await Promise.all([
        this.idb.getAll({ storeName: instanceName }),
        this.idb.getFromIndex({
          storeName: 'lastEvents',
          indexName: 'name',
          key: instanceName
        })
      ])

      if (!savedEvents || !savedEvents.length) {
        return undefined
      }

      const validEvents = savedEvents.map((event) => normalizeEvent(event, type)).filter(Boolean)
      if (type === eventsType.DEPOSIT && !hasCompleteDepositPrefix(validEvents)) {
        return undefined
      }

      return {
        events: validEvents,
        lastBlock: getPersistedEventCursor(lastEvent, validEvents)
      }
    } catch (err) {
      return undefined
    }
  }

  async getEventsFromGraph({ fromBlock, methodName }): Promise<EventsResult | undefined> {
    try {
      const { events, lastSyncBlock } = await (graph as any)[methodName]({
        fromBlock,
        netId: this.netId,
        amount: this.amount,
        currency: this.currency
      })
      return {
        events,
        lastBlock: lastSyncBlock
      }
    } catch (err) {
      return undefined
    }
  }

  async getBlocksDiff({ fromBlock }) {
    const currentBlockNumber = await this.factoryMethods.getBlockNumber()

    return {
      currentBlockNumber,
      blockDifference: Math.ceil(currentBlockNumber - fromBlock)
    }
  }

  getPastEvents({ fromBlock, toBlock, type }, shouldRetry = false, retries = 0): Promise<EventRecord[] | undefined> {
    return new Promise((resolve, reject) => {
      this.factoryMethods
        .getPastEvents(this.contractAddress, capitalizeFirstLetter(type), {
          fromBlock,
          toBlock
        })
        .then((events) => resolve(events))
        .catch((err) => {
          retries++

          // If provider.getBlockNumber returned last block that isn't accepted (happened on Avalanche/Gnosis),
          // get events to last accepted block
          if (err.message.includes('after last accepted block')) {
            const acceptedBlock = parseInt(err.message.split('after last accepted block ')[1])
            toBlock = acceptedBlock
            // Retries to 0, because it is not RPC error
            retries = 0
          }

          // maximum 5 second buffer for rate-limiting
          if (shouldRetry) {
            const shouldRetryAgain = retries < 5

            sleep(1000 * retries).then(() =>
              this.getPastEvents({ fromBlock, toBlock, type }, shouldRetryAgain, retries)
                .then((events) => resolve(events))
                .catch((_) => resolve(undefined))
            )
          } else {
            reject(new Error(err))
          }
        })
    })
  }

  async getEventsPartFromRpc(parameters, shouldRetry = false): Promise<EventsResult | undefined> {
    try {
      const { fromBlock, type } = parameters
      const { currentBlockNumber } = await this.getBlocksDiff({ fromBlock })
      const requestedToBlock =
        parameters.toBlock === 'latest'
          ? currentBlockNumber
          : Math.min(Number(parameters.toBlock), currentBlockNumber)

      if (fromBlock <= currentBlockNumber) {
        const eventsPart = await this.getPastEvents({ ...parameters, toBlock: requestedToBlock }, shouldRetry)

        if (eventsPart) {
          return {
            events: eventsPart.length > 0 ? formatEvents(eventsPart, type) : [],
            lastBlock: requestedToBlock
          }
        }
        return undefined
      } else {
        return {
          events: [],
          lastBlock: clampEventCursor(fromBlock, currentBlockNumber)
        }
      }
    } catch (err) {
      return undefined
    }
  }

  createBatchRequest(batchArray) {
    return batchArray.map(
      (e, i) =>
        new Promise((resolve) =>
          sleep(20 * i).then(() =>
            this.getEventsPartFromRpc({ ...e }, true).then((batch) => {
              if (!batch) {
                resolve([{ isFailedBatch: true, ...e }])
              } else {
                resolve(batch.events)
              }
            })
          )
        )
    )
  }

  async getBatchEventsFromRpc({ fromBlock, type }): Promise<EventsResult | undefined> {
    try {
      const batchSize = 10

      let events: EventRecord[] = []
      let failed: EventRecord[] = []
      let lastBlock = fromBlock

      const { blockDifference, currentBlockNumber } = await this.getBlocksDiff({ fromBlock })
      const batchDigest = blockDifference === 0 ? 1 : Math.ceil(blockDifference / blockSyncInterval)

      const blockDenom = Math.ceil(blockDifference / batchDigest)
      const batchCount = Math.ceil(batchDigest / batchSize)

      if (fromBlock < currentBlockNumber) {
        this.updateEventProgress(0, type)

        for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
          const isLastBatch = batchIndex === batchCount - 1
          const batchStart = batchIndex === 0 ? lastBlock : lastBlock + 1
          const params = createBlockRanges({
            batchStart,
            batchIndex,
            batchSize,
            blockDenom,
            batchDigest,
            currentBlockNumber,
            type
          })
          const batch = await Promise.all(this.createBatchRequest(params))
          const requests = flattenNArray(batch)

          events = events.concat(requests.filter((e) => !e.isFailedBatch))
          failed = failed.concat(requests.filter((e) => e.isFailedBatch))
          lastBlock = params[params.length - 1].toBlock

          const progressIndex = batchIndex - failed.length / batchSize

          if (isLastBatch && failed.length !== 0) {
            const failedBatch = await Promise.all(this.createBatchRequest(failed))
            const failedReqs = flattenNArray(failedBatch)
            const failedRept = failedReqs.filter((e) => e.isFailedBatch)

            if (failedRept.length === 0) {
              events = events.concat(failedReqs)
            } else {
              throw new Error('Failed to batch events')
            }
          }
          this.updateEventProgress(progressIndex / batchCount, type)
        }

        return {
          lastBlock: currentBlockNumber,
          events
        }
      } else {
        return undefined
      }
    } catch (err) {
      return undefined
    }
  }

  async getEventsFromRpc({ fromBlock, type }): Promise<EventsResult | undefined> {
    try {
      const { blockDifference } = await this.getBlocksDiff({ fromBlock })

      let result

      if (blockDifference < blockSyncInterval) {
        result = await this.getEventsPartFromRpc({ fromBlock, toBlock: 'latest', type })
      } else {
        result = await this.getBatchEventsFromRpc({ fromBlock, type })
      }

      return result
    } catch (err) {
      return undefined
    }
  }

  async getEventsFromBlock({ fromBlock, graphMethod, type }): Promise<EventsResult | undefined> {
    try {
      const graphEvents = await this.getEventsFromGraph({ fromBlock, methodName: graphMethod })
      const graphLastBlock = graphEvents?.lastBlock
      const lastSyncBlock = graphLastBlock == null ? fromBlock : Math.max(Number(fromBlock), Number(graphLastBlock))
      const rpcResult = await this.getEventsFromRpc({ fromBlock: lastSyncBlock, type })

      if (rpcResult) {
        const allEvents = mergeEventStreams(graphEvents?.events || [], rpcResult.events || [])
          .map((event) => normalizeEvent(event, type))
          .filter(Boolean) as EventRecord[]
        return {
          events: allEvents,
          lastBlock: rpcResult.lastBlock
        }
      }
      if (graphEvents && (graphEvents.events.length || graphEvents.lastBlock !== '')) {
        return graphEvents
      }
      return undefined
    } catch (err) {
      return undefined
    }
  }

  async saveEvents({ events, lastBlock, type }) {
    try {
      if (this.idb.isBlocked) {
        return
      }

      const instanceName = this.getInstanceName(type)
      const validEvents = (events || []).map((event) => normalizeEvent(event, type)).filter(Boolean)

      if (validEvents.length) {
        await this.idb.createMultipleTransactions({
          data: validEvents,
          storeName: instanceName
        })
      }

      const cursor = Number(lastBlock)
      if (Number.isFinite(cursor)) {
        await this.idb.putItem({
          data: {
            blockNumber: cursor,
            name: instanceName
          },
          storeName: 'lastEvents'
        })
      }
    } catch (err) {
      console.error('saveEvents has error:', err instanceof Error ? err.message : String(err))
    }
  }
}

class EventsFactory {
  instances: Map<string, EventService>
  client: ReturnType<typeof createRpcClient>

  constructor(rpcUrl) {
    this.instances = new Map()
    this.client = createRpcClient(rpcUrl, { timeout: httpConfig.timeout })
    this.getBlockNumber = this.getBlockNumber.bind(this)
    this.getPastEvents = this.getPastEvents.bind(this)
  }

  getBlockNumber() {
    return this.client.getBlockNumber().then(Number)
  }

  async getPastEvents(address, eventName, { fromBlock, toBlock, filter }) {
    return readEventLogs(this.client, {
      address,
      abi: InstanceABI as any,
      eventName,
      filter,
      fromBlock,
      toBlock
    })
  }

  getService(payload) {
    const instanceName = `${payload.netId}_${payload.currency}_${payload.amount}`

    if (this.instances.has(instanceName)) {
      return this.instances.get(instanceName)
    }

    const instance = new EventService({
      ...payload,
      factoryMethods: {
        getBlockNumber: this.getBlockNumber,
        getPastEvents: this.getPastEvents
      }
    })
    this.instances.set(instanceName, instance)
    return instance
  }
}

const eventFactories = new Map()

export const getEventsFactory = (rpcUrl) => {
  if (!eventFactories.has(rpcUrl)) {
    eventFactories.set(rpcUrl, new EventsFactory(rpcUrl))
  }
  return eventFactories.get(rpcUrl)
}

export { EventsFactory }
