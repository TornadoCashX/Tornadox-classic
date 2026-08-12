import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { RelayerJobState } from '@/context/RelayerJobContext'
import { getExplorerUrl, getSymbol } from '@/lib/networkHelpers'
import { formatRelativeTime } from '@/utils/dateTime'

import { TrndIcon } from './Icon'

// Ports components/Job.vue: classic renders one of these, separately from the settled Tx/
// EncryptedTx rows, for each in-flight relayer withdrawal in state.jobs (Txs.vue's
// `<Job v-for="job in jobs('tornado')">`, above the regular list). Unlike a settled row, a job
// has no "Subsequent deposits" concept yet and no note to copy, so those stay disabled/skeleton
// for its whole lifetime; the status column instead mirrors the relayer's own raw job-status
// string (PENDING/SENT/MINED/CONFIRMED/FAILED/...) with a small spinning icon next to it.
const STATUS_LABEL_KEYS: Record<string, string> = {
  ACCEPTED: 'accepted',
  SENT: 'sent',
  MINED: 'mined',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
  QUEUED: 'queued'
}

const JobRow = ({ job, onRemove }: { job: RelayerJobState; onRemove: () => void }) => {
  const { t, i18n } = useTranslation()
  const [time, setTime] = useState('')

  const isFailed = job.status === 'FAILED'
  const isConfirmed = job.status === 'CONFIRMED'
  const isTerminal = isFailed || isConfirmed

  useEffect(() => {
    const update = () => {
      // Mirrors Job.vue's updateTime/moment().fromNow(): re-render the relative "a few seconds
      // ago" text every 10s while the job is still around, same interval classic uses.
      if (!job.timestamp) return
      setTime(formatRelativeTime(job.timestamp, i18n.resolvedLanguage))
    }
    update()
    const timer = setInterval(update, 10000)
    return () => clearInterval(timer)
  }, [job.timestamp, i18n.resolvedLanguage])

  const statusLabel = job.status ? t(STATUS_LABEL_KEYS[job.status] || job.status) : ''

  return (
    <div className={`box box-tx ${isTerminal ? '' : 'is-waiting'} ${isFailed ? 'is-danger' : ''}`} data-test="job_row">
      <div className="columns is-vcentered">
        <div className="column is-time" data-label={t('timePassed')}>
          {time}
        </div>
        <div className="column is-amount" data-label={t('amount')}>
          {job.amount} {job.currency ? getSymbol(job.netId, job.currency) : ''}
        </div>
        <div className="column is-deposit" data-label={t('subsequentDeposits')}>
          {isFailed ? (
            <span>-</span>
          ) : (
            <div className="b-skeleton is-animated">
              <div className="b-skeleton-item is-rounded" style={{ width: 80 }} />
            </div>
          )}
        </div>
        <div className="column is-hash" data-label={t('txHash')}>
          {!job.txHash && job.status !== 'FAILED' ? (
            <div className="b-skeleton is-animated">
              <div className="b-skeleton-item is-rounded" />
            </div>
          ) : (
            job.txHash && (
              <div className="details">
                <p className="detail">
                  <a
                    className="detail-description"
                    data-test="txhash_text"
                    href={getExplorerUrl(job.netId).tx + job.txHash}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {job.txHash}
                  </a>
                </p>
              </div>
            )
          )}
        </div>
        <div className="column is-status" data-label={t('status')}>
          {!job.status ? (
            <div className="b-skeleton is-animated">
              <div className="b-skeleton-item is-rounded" style={{ width: 60 }} />
            </div>
          ) : (
            <div className="status-with-loading">
              {statusLabel}
              {!isTerminal && <TrndIcon name="loading" />}
            </div>
          )}
        </div>
        <div className="column column-buttons">
          <button type="button" className="button is-primary hide-text-touch is-small" disabled data-test="copy_note_button">
            <span className="icon icon-copy" />
            <span>{t('note')}</span>
          </button>
          <button
            type="button"
            data-test="remove_note_button"
            className="button is-dark is-small"
            disabled={!isTerminal}
            onClick={onRemove}
          >
            <TrndIcon name="remove" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default JobRow
