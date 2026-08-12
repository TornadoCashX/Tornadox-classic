let indexedDBFactory = (netId) => {
  throw new Error(`IndexedDB runtime adapter is not configured for netId ${netId}`)
}

export const configureRuntimeStorage = ({ getIndexedDB }) => {
  if (typeof getIndexedDB !== 'function') {
    throw new TypeError('getIndexedDB adapter must be a function')
  }
  indexedDBFactory = getIndexedDB
}

export const getRuntimeIndexedDB = (netId) => indexedDBFactory(netId)
