import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { useAppContext } from '@/context/AppContext'
import { withEventReadRetry } from '@/lib/eventReads'
import { buildTornadoWithdrawalRecord } from '@/services/txRecords'
import { buildConfirmedDepositRecord } from '@/services/depositConfirmation'
import { findDepositEvent, type EventsInterface } from '@/services/depositLookup'
import { parseNote } from '@/utils/crypto'
import { getTransaction } from '@/lib/contracts'
import { trackTxInBackground } from '@/lib/txWatcher'
import txStatus from '@/store/txStatus'
import {
  deleteTxHash,
  getTxs,
  saveTxHashes,
  saveTxHash,
  updateDepositOnWithdrawal,
  type TxRecord,
  type TxStoreType
} from '@/services/localTxStore'

interface TransactionsContextValue {
  txs: TxRecord[]
  encryptedTxs: TxRecord[]
  allTxs: TxRecord[]
  save: (storeType: TxStoreType, record: { txHash: string } & Partial<TxRecord>) => boolean
  saveMany: (storeType: TxStoreType, records: Array<{ txHash: string } & Partial<TxRecord>>) => boolean
  remove: (storeType: TxStoreType, txHash: string) => void
  confirmDeposit: (storeType: TxStoreType, record: TxRecord, blockNumber: number) => Promise<void>
  recordWithdrawal: (params: {
    withdrawNote: string
    txHash: string
    fee: string
    amount: string | number
    currency: string
  }) => Promise<void>
}

const TransactionsContext = createContext<TransactionsContextValue | null>(null)

// React equivalent of store/txHashKeeper.js's chain-scoped Vuex module (mapGetters('txHashKeeper',
// ['txs', 'encryptedTxs', 'allTxs']) + the SAVE_TX_HASH/DELETE_TX mutations), backed by
// services/localTxStore.ts (localStorage). A context (not a plain hook) because DepositTab,
// WithdrawTab and Transactions.tsx all need to read/write the *same* live list - a plain hook
// would give each caller its own independent useState, so a save() in DepositTab would never be
// seen by Transactions.tsx until an unrelated re-render happened to call getTxs() again.
export const TransactionsProvider = ({ children }: { children: ReactNode }) => {
  const { netId } = useAppContext()
  const [txs, setTxs] = useState<TxRecord[]>([])
  const [encryptedTxs, setEncryptedTxs] = useState<TxRecord[]>([])
  const watchedPendingRef = useRef(new Set<string>())
  const currentNetIdRef = useRef(netId)
  currentNetIdRef.current = netId

  const refresh = useCallback(() => {
    setTxs(getTxs(netId, 'txs'))
    setEncryptedTxs(getTxs(netId, 'encryptedTxs'))
  }, [netId])

  const confirmDeposit = useCallback(
    async (storeType: TxStoreType, record: TxRecord, blockNumber: number) => {
      const recordNetId = Number(record.netId)
      let confirmed: TxRecord = { ...record, status: txStatus.success, blockNumber }

      try {
        confirmed = await withEventReadRetry(recordNetId, (eventsInterface) =>
          buildConfirmedDepositRecord({ record, blockNumber, eventsInterface })
        )
      } catch (error) {
        // The receipt is authoritative for transaction success. Event indexing is best-effort and
        // must not incorrectly mark a mined deposit as failed when its RPC lookup is unavailable.
        console.error('Unable to resolve confirmed deposit leaf index', error)
      }

      saveTxHash(recordNetId, storeType, confirmed)
      if (currentNetIdRef.current === recordNetId) refresh()
    },
    [refresh]
  )

  useEffect(() => {
    refresh()

    const resume = (storeType: TxStoreType) => {
      getTxs(netId, storeType)
        .filter((record) => record.status === txStatus.waitingForReciept)
        .forEach((record) => {
          const key = `${netId}:${storeType}:${record.txHash}`
          if (watchedPendingRef.current.has(key)) return
          watchedPendingRef.current.add(key)

          trackTxInBackground(
            { netId, txHash: record.txHash },
            {
              onConfirmed: ({ blockNumber }) => {
                void confirmDeposit(storeType, record, blockNumber).finally(() => {
                  watchedPendingRef.current.delete(key)
                })
              },
              onFailed: () => {
                saveTxHash(netId, storeType, { ...record, status: txStatus.fail })
                watchedPendingRef.current.delete(key)
                if (currentNetIdRef.current === netId) refresh()
              },
              onUnconfirmed: () => {
                // Keep the record pending. A later reload resumes it; an RPC timeout is not a
                // statement about whether the chain eventually mined the transaction.
                watchedPendingRef.current.delete(key)
              }
            }
          )
        })
    }

    resume('txs')
    resume('encryptedTxs')
  }, [netId, refresh, confirmDeposit])

  const save = useCallback(
    (storeType: TxStoreType, record: { txHash: string } & Partial<TxRecord>) => {
      const persisted = saveTxHash(netId, storeType, record)
      refresh()
      return persisted
    },
    [netId, refresh]
  )

  const saveMany = useCallback(
    (storeType: TxStoreType, records: Array<{ txHash: string } & Partial<TxRecord>>) => {
      const persisted = saveTxHashes(netId, storeType, records)
      refresh()
      return persisted
    },
    [netId, refresh]
  )

  const remove = useCallback(
    (storeType: TxStoreType, txHash: string) => {
      deleteTxHash(netId, storeType, txHash)
      refresh()
    },
    [netId, refresh]
  )

  // Mirrors store/txHashKeeper.js's updateDeposit ('tornado' branch) - builds a withdrawal
  // record via the already-ported services/txRecords.js and applies the resulting mutation:
  // either re-keying a deposit this browser already knew about (UPDATE_DEPOSIT), or, if the
  // note was deposited elsewhere and this browser never saw it, inserting a fresh spent record
  // from the on-chain deposit event (SAVE_TX_HASH).
  const recordWithdrawal = useCallback(
    async ({
      withdrawNote,
      txHash,
      fee,
      amount,
      currency
    }: {
      withdrawNote: string
      txHash: string
      fee: string
      amount: string | number
      currency: string
    }) => {
      try {
        const { mutation, tx } = await withEventReadRetry(netId, (eventsInterface: EventsInterface) =>
          buildTornadoWithdrawalRecord({
            note: withdrawNote,
            txHash,
            fee,
            amount,
            currency,
            netId,
            encryptedTxs,
            txs,
            getBlockNumber: async ({ txHash: hash }: { txHash: string }) => {
              const chainTx = await getTransaction(netId, hash)
              return chainTx ? Number(chainTx.blockNumber) : undefined
            },
            loadDepositEvent: async ({ withdrawNote: note }: { withdrawNote: string }) => {
              const parsed = parseNote(note)
              const event = await findDepositEvent({ eventsInterface, note: parsed })
              if (!event) throw new Error('Deposit event not found')
              return { txHash: event.transactionHash, depositBlock: event.blockNumber, leafIndex: event.leafIndex }
            }
          })
        )

        const storeType: TxStoreType = tx.storeType === 'encryptedTxs' ? 'encryptedTxs' : 'txs'

        if (mutation === 'UPDATE_DEPOSIT') {
          updateDepositOnWithdrawal(netId, storeType, tx.txHash, {
            withdrawTxHash: tx.withdrawTxHash,
            fee: tx.fee,
            blockNumber: tx.blockNumber
          })
        } else {
          saveTxHash(netId, storeType, tx)
        }
        refresh()
      } catch (err) {
        // Best-effort local bookkeeping only - a failure here shouldn't surface as a withdrawal
        // error, since the on-chain withdrawal itself already succeeded by the time this runs.
        console.error('recordWithdrawal', err)
      }
    },
    [netId, txs, encryptedTxs, refresh]
  )

  const value = useMemo<TransactionsContextValue>(
    () => ({
      txs,
      encryptedTxs,
      allTxs: txs.concat(encryptedTxs),
      save,
      saveMany,
      remove,
      confirmDeposit,
      recordWithdrawal
    }),
    [txs, encryptedTxs, save, saveMany, remove, confirmDeposit, recordWithdrawal]
  )

  return <TransactionsContext.Provider value={value}>{children}</TransactionsContext.Provider>
}

export const useTransactions = () => {
  const ctx = useContext(TransactionsContext)
  if (!ctx) throw new Error('useTransactions must be used within TransactionsProvider')
  return ctx
}
