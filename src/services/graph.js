// @ts-check
import {
  _META,
  GET_DEPOSITS,
  GET_STATISTIC,
  GET_WITHDRAWALS,
  GET_NOTE_ACCOUNTS,
  GET_ENCRYPTED_NOTES
} from './queries'
import { getNextSyncBlock, splitGraphPage } from './eventSync'
import { getGraphApiKey } from '@/config/publicEnv'

const isEmptyArray = (arr) => !Array.isArray(arr) || !arr.length

const first = 1000

function getApiKey(chainId) {
  return getGraphApiKey(chainId)
}

const getGraphUrl = (chainId) => {
  const graphUrl = CHAIN_GRAPH_URLS[chainId]
  if (!graphUrl) throw new Error(`Graph is not configured for chain ${chainId}`)
  if (!graphUrl.includes('{apiKey}')) return graphUrl

  const apiKey = getApiKey(chainId)
  if (!apiKey) throw new Error(`Graph API key is not configured for chain ${chainId}`)

  return graphUrl.replace('{apiKey}', apiKey)
}

const CHAIN_GRAPH_URLS = {
  1: 'https://gateway.thegraph.com/api/{apiKey}/subgraphs/id/Ec6fVMDVqXTDQZ3c4jxcyV3zBXqkdgMWfhdtCgtqn7Sh',
  10: 'https://gateway.thegraph.com/api/{apiKey}/subgraphs/id/GvkbnEVhLD6KArXpEzLFtSKRmspBW29ApKFqR5FjuP2P',
  56: 'https://gateway.thegraph.com/api/{apiKey}/subgraphs/id/CiwGzefDBZCavXRPnwarnnF8xDDoLw4boBuySomJWYnV',
  61: 'https://graph.torndao.com/subgraphs/name/tornadocash/etc-tornado-subgraph',
  100: 'https://gateway.thegraph.com/api/{apiKey}/subgraphs/id/F1m8vxuGatCBRvP8fPnnWUJ1oK7kfE1DGdRacqoamLjF',
  137: 'https://gateway.thegraph.com/api/{apiKey}/subgraphs/id/HUMgwMYNrPQpnBJgesFXyy5u6jSiJ6u5nNWQng9ayCmD',
  42161: 'https://gateway.thegraph.com/api/{apiKey}/subgraphs/id/8x8o6XFAqYZmiPwrJ51UxGTaZLYyW1fFtghvsEy7a1KJ',
  43114: 'https://gateway.thegraph.com/api/{apiKey}/subgraphs/id/CqUYVKJT9Jsyt7qnGNrf4FJNHw75ZbFGuzaJgqdaFASo',
  11155111: 'https://gateway.thegraph.com/api/{apiKey}/subgraphs/id/8kJGz92AYUm72wfyUoze1as3E11ynDSTZM8emiRWrRPy'
}

/** @param {{chainId: number, query: string, variables?: Record<string, unknown>}} options */
const queryGraph = async ({ chainId, query, variables }) => {
  const response = await fetch(getGraphUrl(chainId), {
    method: 'POST',
    credentials: 'omit',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables })
  })
  if (!response.ok) throw new Error(`Graph request failed with status ${response.status}`)

  const payload = await response.json()
  if (!payload.data && payload.errors?.length) {
    throw new Error(payload.errors.map(({ message }) => message).join('; '))
  }
  return payload.data
}

async function getStatistic({ currency, amount, netId }) {
  try {
    const data = await queryGraph({
      chainId: netId,
      query: GET_STATISTIC,
      variables: {
        currency,
        first: 10,
        orderBy: 'index',
        orderDirection: 'desc',
        amount: String(amount)
      }
    })

    if (!data) {
      return {
        lastSyncBlock: '',
        events: []
      }
    }

    const { deposits } = data

    const lastSyncBlock = await getMeta({ netId })

    const events = deposits
      .map((e) => ({
        timestamp: e.timestamp,
        leafIndex: Number(e.index),
        blockNumber: Number(e.blockNumber)
      }))
      .reverse()

    const [lastEvent] = events.slice(-1)

    return {
      lastSyncBlock: getNextSyncBlock(lastSyncBlock, lastEvent),
      events
    }
  } catch {
    return {
      lastSyncBlock: '',
      events: []
    }
  }
}

async function getAllDeposits({ currency, amount, fromBlock, netId }) {
  try {
    let deposits = []

    while (true) {
      const result = await getDeposits({ currency, amount, fromBlock, netId })

      if (isEmptyArray(result)) {
        break
      }

      const page = splitGraphPage(result, fromBlock, first)
      deposits = deposits.concat(page.events)
      if (page.isComplete) break
      fromBlock = page.nextBlock
    }

    const lastSyncBlock = await getMeta({ netId })

    const data = deposits.map((e) => ({
      timestamp: e.timestamp,
      commitment: e.commitment,
      leafIndex: Number(e.index),
      blockNumber: Number(e.blockNumber),
      transactionHash: e.transactionHash
    }))

    const [lastEvent] = data.slice(-1)

    return {
      events: data,
      lastSyncBlock: getNextSyncBlock(lastSyncBlock, lastEvent)
    }
  } catch {
    return {
      lastSyncBlock: '',
      events: []
    }
  }
}

async function getMeta({ netId }) {
  try {
    const data = await queryGraph({
      chainId: netId,
      query: _META
    })

    if (!data) {
      return undefined
    }

    return data._meta.block.number
  } catch {
    return undefined
  }
}

async function getDeposits({ currency, amount, fromBlock, netId }) {
  const data = await queryGraph({
    chainId: netId,
    query: GET_DEPOSITS,
    variables: { currency, amount: String(amount), first, fromBlock }
  })

  if (!data) {
    return []
  }

  return data.deposits
}

async function getAllWithdrawals({ currency, amount, fromBlock, netId }) {
  try {
    let withdrawals = []

    while (true) {
      const result = await getWithdrawals({ currency, amount, fromBlock, netId })

      if (isEmptyArray(result)) {
        break
      }

      const page = splitGraphPage(result, fromBlock, first)
      withdrawals = withdrawals.concat(page.events)
      if (page.isComplete) break
      fromBlock = page.nextBlock
    }

    const lastSyncBlock = await getMeta({ netId })

    const data = withdrawals.map((e) => ({
      to: e.to,
      fee: e.fee,
      timestamp: e.timestamp,
      nullifierHash: e.nullifier,
      blockNumber: Number(e.blockNumber),
      transactionHash: e.transactionHash
    }))

    const [lastEvent] = data.slice(-1)

    return {
      events: data,
      lastSyncBlock: getNextSyncBlock(lastSyncBlock, lastEvent)
    }
  } catch {
    return {
      lastSyncBlock: '',
      events: []
    }
  }
}

async function getWithdrawals({ currency, amount, fromBlock, netId }) {
  const data = await queryGraph({
    chainId: netId,
    query: GET_WITHDRAWALS,
    variables: { currency, amount: String(amount), fromBlock, first }
  })

  if (!data) {
    return []
  }

  return data.withdrawals
}

async function getNoteAccounts({ address, netId }) {
  try {
    const data = await queryGraph({
      chainId: netId,
      query: GET_NOTE_ACCOUNTS,
      variables: { address }
    })

    if (!data) {
      return {
        lastSyncBlock: '',
        events: []
      }
    }

    const lastSyncBlock = await getMeta({ netId })

    return {
      lastSyncBlock: getNextSyncBlock(lastSyncBlock),
      events: data.noteAccounts
    }
  } catch {
    return {
      lastSyncBlock: '',
      events: []
    }
  }
}

async function getAllEncryptedNotes({ fromBlock, netId }) {
  try {
    let encryptedNotes = []

    while (true) {
      const result = await getEncryptedNotes({ fromBlock, netId })

      if (isEmptyArray(result)) {
        break
      }

      const page = splitGraphPage(result, fromBlock, first)
      encryptedNotes = encryptedNotes.concat(page.events)
      if (page.isComplete) break
      fromBlock = page.nextBlock
    }

    const lastSyncBlock = await getMeta({ netId })

    const data = encryptedNotes.map((e) => ({
      txHash: e.transactionHash,
      encryptedNote: e.encryptedNote,
      transactionHash: e.transactionHash,
      blockNumber: Number(e.blockNumber)
    }))

    const [lastEvent] = data.slice(-1)

    return {
      events: data,
      lastSyncBlock: getNextSyncBlock(lastSyncBlock, lastEvent)
    }
  } catch {
    return {
      lastSyncBlock: '',
      events: []
    }
  }
}

async function getEncryptedNotes({ fromBlock, netId }) {
  const data = await queryGraph({
    chainId: netId,
    query: GET_ENCRYPTED_NOTES,
    variables: { fromBlock, first }
  })

  if (!data) {
    return []
  }

  return data.encryptedNotes
}

export default {
  getDeposits,
  getStatistic,
  getAllDeposits,
  getWithdrawals,
  getNoteAccounts,
  getAllWithdrawals,
  getAllEncryptedNotes
}
