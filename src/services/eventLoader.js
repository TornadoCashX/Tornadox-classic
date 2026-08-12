import networkConfig from '@/networkConfig'
import { download } from '@/services/runtimeAssets'

export const syncEvents = ({ eventsInterface, payload }) => {
  const eventService = eventsInterface.getService(payload)

  return eventService.updateEvents(payload.type)
}

export const getCurrentEventSyncParams = async ({
  currency,
  amount,
  lastEvent,
  type,
  netId,
  nativeCurrency,
  idb
}) => {
  let lastBlock = lastEvent
  const { deployedBlock } = networkConfig[`netId${netId}`]

  if (currency === nativeCurrency && !lastEvent) {
    lastBlock = await idb.getFromIndex({
      indexName: 'name',
      storeName: 'lastEvents',
      key: `${type}s_${netId}_${currency}_${amount}`
    })
  }

  return {
    type,
    netId,
    amount,
    currency,
    fromBlock: lastBlock ? lastBlock.blockNumber + 1 : deployedBlock
  }
}

export const loadEncryptedEventsBundle = async ({ netId }) => {
  const module = await download({
    name: `events/encrypted_notes_${netId}.json.gz`
  })

  if (!module) return undefined

  const events = JSON.parse(module)

  return {
    events,
    lastBlock: events.length ? events[events.length - 1].blockNumber : ''
  }
}
