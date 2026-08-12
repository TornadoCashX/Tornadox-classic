import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAppContext } from '@/context/AppContext'
import { useRelayerJob } from '@/context/RelayerJobContext'
import { useTransactions } from '@/context/TransactionsContext'
import { getNetworkConfig } from '@/lib/networkHelpers'
import type { TxRecord } from '@/services/localTxStore'

import JobRow from './JobRow'
import TransactionRow from './TransactionRow'

type TransactionFilter = 'all' | 'regular' | 'encrypted'

// Ports components/Txs.vue. Pending wallet transactions are resumed by TransactionsContext after
// reload, while amount sorting compares raw amounts rather than classic's
// token-price-weighted comparison (this app doesn't have a price oracle wired up for local
// records). The in-flight relayer "Job" row (Txs.vue's `<Job v-for="job in jobs('tornado')">`)
// is ported, via RelayerJobContext - see JobRow.tsx.
const Transactions = () => {
  const { t } = useTranslation()
  const { netId } = useAppContext()
  const { txs, encryptedTxs, allTxs, remove } = useTransactions()
  const { jobs, clearJob } = useRelayerJob()
  const chainJobs = jobs.filter((job) => job.netId === netId)
  const hasJob = chainJobs.length > 0

  const [currencyFilter, setCurrencyFilter] = useState('')
  const [spentFilter, setSpentFilter] = useState<boolean | undefined>(undefined)
  const [transactionFilter, setTransactionFilter] = useState<TransactionFilter>('all')
  const [currentSort, setCurrentSort] = useState<'timestamp' | 'amount' | 'index'>('timestamp')
  const [isAsc, setIsAsc] = useState(false)

  const tokens = getNetworkConfig(netId).tokens as Record<string, { symbol: string }>
  const activeTokenFilters = useMemo(() => new Set(allTxs.map((tx) => tx.currency)), [allTxs])

  const sourceTxs = transactionFilter === 'regular' ? txs : transactionFilter === 'encrypted' ? encryptedTxs : allTxs

  const filteredTxs = useMemo(() => {
    return sourceTxs
      .filter((tx) => {
        if (currencyFilter && tx.currency !== currencyFilter) return false
        if (spentFilter !== undefined && Boolean(tx.isSpent) !== spentFilter) return false
        return true
      })
      .slice()
      .sort((a, b) => {
        const dir = isAsc ? 1 : -1
        if (currentSort === 'amount') return dir * (Number(a.amount) - Number(b.amount))
        if (currentSort === 'index') return dir * (Number(a.index ?? 0) - Number(b.index ?? 0))
        return dir * (Number(a.timestamp) - Number(b.timestamp))
      })
  }, [sourceTxs, currencyFilter, spentFilter, currentSort, isAsc])

  const setSort = (sort: typeof currentSort) => {
    setIsAsc(sort === currentSort ? !isAsc : true)
    setCurrentSort(sort)
  }

  const isRowEncrypted = (tx: TxRecord) => encryptedTxs.includes(tx)

  if (allTxs.length === 0 && !hasJob) return null

  return (
    <div className="txs">
      <div className="tx-filters buttons">
        <div className="tx-filters-title">{t('filterBy')}</div>
        {Object.entries(tokens).map(([key, token]) => (
          <button
            key={key}
            type="button"
            className={`button is-primary is-small is-outlined ${currencyFilter === key ? 'is-hovered' : ''}`}
            disabled={!activeTokenFilters.has(key) && currencyFilter !== key}
            onClick={() => setCurrencyFilter((prev) => (prev === key ? '' : key))}
          >
            {token.symbol}
          </button>
        ))}
        <div className="break" />
        <div className="field has-addons">
          <p className="control">
            <button
              type="button"
              className={`button is-primary is-small is-outlined ${spentFilter === true ? 'is-hovered' : ''}`}
              onClick={() => setSpentFilter((prev) => (prev === true ? undefined : true))}
            >
              {t('spent')}
            </button>
          </p>
          <p className="control">
            <button
              type="button"
              className={`button is-primary is-small is-outlined ${spentFilter === false ? 'is-hovered' : ''}`}
              onClick={() => setSpentFilter((prev) => (prev === false ? undefined : false))}
            >
              {t('unspent')}
            </button>
          </p>
        </div>
        <div className="break" />
        <div className="field has-addons">
          <p className="control">
            <button
              type="button"
              className={`button is-primary is-small is-outlined ${transactionFilter === 'regular' ? 'is-hovered' : ''}`}
              onClick={() => setTransactionFilter((prev) => (prev === 'regular' ? 'all' : 'regular'))}
            >
              {t('regular')}
            </button>
          </p>
          <p className="control">
            <button
              type="button"
              className={`button is-primary is-small is-outlined ${transactionFilter === 'encrypted' ? 'is-hovered' : ''}`}
              onClick={() => setTransactionFilter((prev) => (prev === 'encrypted' ? 'all' : 'encrypted'))}
            >
              {t('encrypted')}
            </button>
          </p>
        </div>
      </div>

      <div className="tx-head">
        <div className="columns">
          <div className="column is-time is-sortable" onClick={() => setSort('timestamp')}>
            {t('timePassed')}
            {currentSort === 'timestamp' && <span className={`icon icon-chevron-up ${!isAsc ? 'is-desc' : ''}`} />}
          </div>
          <div className="column is-amount is-sortable" onClick={() => setSort('amount')}>
            {t('amount')}
            {currentSort === 'amount' && <span className={`icon icon-chevron-up ${!isAsc ? 'is-desc' : ''}`} />}
          </div>
          <div className="column is-deposit is-sortable" onClick={() => setSort('index')}>
            {t('subsequentDeposits')}
            {currentSort === 'index' && <span className={`icon icon-chevron-up ${!isAsc ? 'is-desc' : ''}`} />}
          </div>
          <div className="column is-hash">{t('txHash')}</div>
          <div className="column is-status">{t('status')}</div>
          <div className="column column-buttons" />
        </div>
      </div>

      {chainJobs.map((job) => (
        <JobRow key={job.uid} job={job} onRemove={() => clearJob(job.uid)} />
      ))}

      {filteredTxs.map((tx) => (
        <TransactionRow
          key={tx.txHash}
          tx={tx}
          isEncrypted={isRowEncrypted(tx)}
          onDelete={() => remove(isRowEncrypted(tx) ? 'encryptedTxs' : 'txs', tx.txHash)}
        />
      ))}

      {filteredTxs.length === 0 && !hasJob && (
        <div className="box box-tx is-white">
          <div className="columns is-vcentered is-centered">
            <div className="column">{t('thereAreNoElements')}</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Transactions
