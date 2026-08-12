import txStatus from '@/store/txStatus'

export type TxStoreType = 'txs' | 'encryptedTxs'

export interface TxRecord {
  txHash: string
  prefix?: string
  note?: string
  amount: string | number
  currency: string
  netId: number
  timestamp: number
  status: number
  index?: number | string
  isSpent?: boolean
  blockNumber?: number
  withdrawTxHash?: string
  fee?: string
  type?: string
  [key: string]: unknown
}

// React/localStorage stand-in for store/txHashKeeper.js's chain-scoped Vuex state
// ({txs, encryptedTxs} per netId) - this app has no Vuex store, and these records need to
// survive page reloads (classic's screenshot shows "3 hours ago" entries), so localStorage is
// the natural equivalent here. Key layout: `tornado-txs-{netId}-{storeType}` -> Record<txHash, TxRecord>.
const storageKey = (netId: number, storeType: TxStoreType) => `tornado-txs-${netId}-${storeType}`

const readAll = (netId: number, storeType: TxStoreType): Record<string, TxRecord> => {
  try {
    const raw = window.localStorage.getItem(storageKey(netId, storeType))
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const writeAll = (netId: number, storeType: TxStoreType, records: Record<string, TxRecord>): boolean => {
  try {
    window.localStorage.setItem(storageKey(netId, storeType), JSON.stringify(records))
    return true
  } catch (error) {
    console.error('Unable to persist local transaction history', error)
    return false
  }
}

export const saveTxHashes = (
  netId: number,
  storeType: TxStoreType,
  records: Array<{ txHash: string } & Partial<TxRecord>>
): boolean => {
  const all = readAll(netId, storeType)

  records.forEach((record) => {
    if (storeType === 'encryptedTxs' && record.commitmentHex) {
      const previousKey = Object.keys(all).find(
        (key) => all[key].commitmentHex === record.commitmentHex && key !== record.txHash
      )
      if (previousKey) delete all[previousKey]
    }

    all[record.txHash] = {
      ...(all[record.txHash] || {}),
      status: txStatus.success,
      ...record,
      netId
    } as TxRecord
  })

  return writeAll(netId, storeType, all)
}

// Mirrors SAVE_TX_HASH.
export const saveTxHash = (
  netId: number,
  storeType: TxStoreType,
  record: { txHash: string } & Partial<TxRecord>
): boolean => saveTxHashes(netId, storeType, [record])

// Mirrors DELETE_TX.
export const deleteTxHash = (netId: number, storeType: TxStoreType, txHash: string): void => {
  const all = readAll(netId, storeType)
  delete all[txHash]
  writeAll(netId, storeType, all)
}

// Mirrors SET_SPENT.
// Mirrors UPDATE_DEPOSIT - re-keys a deposit record under its withdrawal's tx hash once spent,
// recording both hashes.
export const updateDepositOnWithdrawal = (
  netId: number,
  storeType: TxStoreType,
  depositTxHash: string,
  patch: Partial<TxRecord> & { withdrawTxHash: string }
): void => {
  const all = readAll(netId, storeType)
  const existing = all[depositTxHash]
  delete all[depositTxHash]
  all[patch.withdrawTxHash] = {
    ...existing,
    ...patch,
    depositTxHash,
    txHash: patch.withdrawTxHash,
    isSpent: true,
    status: txStatus.success
  } as TxRecord
  writeAll(netId, storeType, all)
}

export const getTxs = (netId: number, storeType: TxStoreType): TxRecord[] => {
  return Object.values(readAll(netId, storeType)).reverse()
}
