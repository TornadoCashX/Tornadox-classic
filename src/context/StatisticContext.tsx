import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

import { loadAllNextDepositIndexes, type NextDepositIndexMap } from '@/lib/contracts'

import { useAppContext } from './AppContext'

// Mirrors store/application.js's state.statistic + loadAllNotesData: a single shared cache of
// each pool's nextDepositIndex, bulk-loaded ONCE per chain via one Multicall aggregate() call
// (see loadAllNextDepositIndexes in lib/contracts.ts) and kept fresh afterwards by whoever
// already fetches a fresher value live (Statistics.tsx's per-selection RPC call, mirroring
// classic's updateSelectEvents also committing SAVE_LAST_INDEX). Every other reader - every
// Transactions row, the Withdraw tab's note-info panel - only ever reads this cache, exactly
// like classic's Tx.vue/EncryptedTx.vue's `mapState('application', ['statistic'])` computed
// properties, which never call the RPC themselves.
interface StatisticContextValue {
  getNextDepositIndex: (currency: string, amount: string | number) => number | null
  setNextDepositIndex: (currency: string, amount: string | number, value: number) => void
  // True once the bulk load has failed for the current chain. Readers need to tell "not loaded
  // yet" (keep showing a skeleton) apart from "will never load" (show a placeholder instead of
  // spinning forever) - getNextDepositIndex returns null for both.
  hasLoadError: boolean
}

const StatisticContext = createContext<StatisticContextValue | null>(null)

export const StatisticProvider = ({ children }: { children: ReactNode }) => {
  const { netId } = useAppContext()
  const [map, setMap] = useState<NextDepositIndexMap>({})
  const [hasLoadError, setHasLoadError] = useState(false)
  const mapRef = useRef(map)
  mapRef.current = map

  useEffect(() => {
    let cancelled = false
    setMap({})
    setHasLoadError(false)
    loadAllNextDepositIndexes(netId)
      .then((result) => {
        if (!cancelled) setMap(result)
      })
      .catch((error) => {
        // Bulk load failed (e.g. RPC unreachable / block-range limit). classic's loadAllNotesData
        // also falls through without throwing, but it can afford to: readers there degrade to a
        // dash. Here every reader renders a loading skeleton while the index is null, so
        // swallowing this silently left rows spinning forever - flag it so they can show a
        // placeholder instead.
        // eslint-disable-next-line no-console
        console.error('loadAllNextDepositIndexes failed', error)
        if (!cancelled) setHasLoadError(true)
      })
    return () => {
      cancelled = true
    }
  }, [netId])

  const getNextDepositIndex = useCallback((currency: string, amount: string | number) => {
    return mapRef.current[currency]?.[String(amount)] ?? null
  }, [])

  const setNextDepositIndex = useCallback((currency: string, amount: string | number, value: number) => {
    setMap((prev) => ({ ...prev, [currency]: { ...prev[currency], [String(amount)]: value } }))
  }, [])

  return (
    <StatisticContext.Provider value={{ getNextDepositIndex, setNextDepositIndex, hasLoadError }}>
      {children}
    </StatisticContext.Provider>
  )
}

export const useStatistic = () => {
  const ctx = useContext(StatisticContext)
  if (!ctx) throw new Error('useStatistic must be used within a StatisticProvider')
  return ctx
}
