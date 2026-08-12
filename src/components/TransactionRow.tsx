import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'

import { useAppContext } from '@/context/AppContext'
import { useNotice } from '@/context/NoticeContext'
import { useStatistic } from '@/context/StatisticContext'
import { getExplorerUrl, getSymbol } from '@/lib/networkHelpers'
import { getTxStatusClass } from '@/services/txRecords'
import txStatus from '@/store/txStatus'
import type { TxRecord } from '@/services/localTxStore'

import { formatPipePlural } from '@/utils/i18nFormat'
import { formatRelativeTime } from '@/utils/dateTime'

import ConfirmDialog from './ConfirmDialog'
import { TrndIcon } from './Icon'
import Tooltip from './Tooltip'

// Ports components/Tx.vue (and doubles for EncryptedTx.vue - classic's version is nearly
// identical, differing mainly in the lock icon/border styling already covered by the
// `.is-encrypted` CSS class applied here via the `isEncrypted` prop).
const TransactionRow = ({
  tx,
  isEncrypted,
  onDelete
}: {
  tx: TxRecord
  isEncrypted: boolean
  onDelete: () => void
}) => {
  const { t, i18n } = useTranslation()
  const { netId } = useAppContext()
  const { addNoticeWithInterval } = useNotice()
  const { getNextDepositIndex, hasLoadError } = useStatistic()
  const { copy, label: copyLabel } = useCopyToClipboard()
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)

  const isWaiting = tx.status === txStatus.waitingForReciept
  const isFailed = tx.status === txStatus.fail

  // Mirrors Tx.vue's mixingPower computed property: reads the pool's nextDepositIndex out of
  // the shared StatisticContext cache (bulk-loaded once via Multicall, see StatisticContext.tsx)
  // instead of this row making its own RPC call - classic's rows never call the RPC themselves
  // either, they only ever read already-loaded Vuex state.
  const mixingPower = (() => {
    if (tx.index === undefined) return '-'
    if (isWaiting) return null // shows a loading skeleton below
    if (isFailed) return '-'
    if (!tx.prefix) return null
    const [, currency, amount] = tx.prefix.split('-')
    const nextDepositIndex = getNextDepositIndex(currency, amount)
    // Distinguishes "still loading" from "load failed": returning null renders a skeleton, so on
    // a failed bulk load that would spin forever (see StatisticContext's hasLoadError).
    if (nextDepositIndex === null) return hasLoadError ? '-' : null
    const depositsPast = nextDepositIndex - Number(tx.index) - 1
    if (depositsPast < 0) return null
    return formatPipePlural(t('userDeposit'), depositsPast)
  })()

  const status = isWaiting
    ? t('waitingForReceipt')
    : isFailed
      ? t('failed')
      : tx.isSpent
        ? t('spent')
        : t('deposited')

  const onCopyNote = () => {
    if (!tx.note || !tx.prefix) return
    copy(`${tx.prefix}-${tx.note}`)
  }

  // Mirrors Tx.vue's onClose: classic's own DELETE_TX commit runs inside a
  // $buefy.dialog.confirm onConfirm callback, then dispatches a "note deleted" toast - onDelete
  // here is Transactions.tsx's own txHashKeeper-equivalent removal, called the same way.
  const onConfirmDelete = () => {
    setIsConfirmingDelete(false)
    onDelete()
    addNoticeWithInterval({ type: 'info', title: t('noteHasBeenDeleted') }, 2000)
  }

  return (
    <div
      className={`box box-tx ${isWaiting ? 'is-waiting' : ''} ${isFailed ? 'is-danger' : ''} ${
        tx.isSpent ? 'is-spent' : ''
      } ${isEncrypted ? 'is-encrypted' : ''} ${getTxStatusClass(tx.status) || ''}`}
    >
      <div className="columns is-vcentered">
        {isEncrypted && <div className="lock" />}
        <div className="column is-time" data-label={t('timePassed')}>
          {formatRelativeTime(tx.timestamp, i18n.resolvedLanguage)}
        </div>
        <div className="column is-amount" data-label={t('amount')}>
          {tx.amount} {getSymbol(netId, tx.currency)}
        </div>
        <div className="column is-deposit" data-label={t('subsequentDeposits')}>
          {/* Mirrors Tx.vue's <b-skeleton v-if="mixingPower === 'loading'" width="80" /> - Buefy's
              real b-skeleton renders `.b-skeleton > .b-skeleton-item.is-rounded` (rounded: true is
              its default), not a bare `.skeleton` class, which styles/components/_skeleton.scss's
              `.b-skeleton-item` rules (rounded corners, animated shimmer gradient) never matched -
              it was rendering as an unstyled plain gray box instead of the intended pill shape. */}
          {mixingPower ?? (
            <div className="b-skeleton is-animated">
              <div className="b-skeleton-item is-rounded" style={{ width: 80 }} />
            </div>
          )}
        </div>
        <div className="column is-hash" data-label={t('txHash')}>
          <div className="details">
            <p className="detail">
              <a
                className="detail-description"
                data-test="txhash_text"
                href={getExplorerUrl(netId).tx + tx.txHash}
                target="_blank"
                rel="noopener noreferrer"
              >
                {tx.txHash}
              </a>
            </p>
          </div>
        </div>
        <div className="column is-status" data-label={t('status')}>
          {status}
        </div>
        <div className="column column-buttons">
          {/* Mirrors Tx.vue's <b-tooltip :active="!!tx.note" :label="tooltipShareUrl"> - the
              button's own label always stays "Note" (classic never swaps it); only the hover
              tooltip switches between "Copy Note" and "Copied" (via useCopyToClipboard's
              1.5s-reset label, same as onCopyLink's copyTimer). Tooltip only wraps the button
              when there's actually a note to copy, matching Buefy's :active toggle. */}
          {tx.note ? (
            <Tooltip className="is-primary is-left is-small" trigger={
              <button
                type="button"
                className="button is-primary hide-text-touch is-small"
                data-test="copy_note_button"
                onClick={onCopyNote}
              >
                <span className="icon icon-copy" />
                <span>{t('note')}</span>
              </button>
            }>
              {copyLabel || t('copyNote')}
            </Tooltip>
          ) : (
            <button type="button" className="button is-primary hide-text-touch is-small" disabled data-test="copy_note_button">
              <span className="icon icon-copy" />
              <span>{t('note')}</span>
            </button>
          )}
          <button
            type="button"
            data-test="remove_note_button"
            className="button is-dark is-small"
            onClick={() => setIsConfirmingDelete(true)}
          >
            {/* icon-remove has no rule in the BgIcon (background-image) icon set - classic's
                b-icon="remove" resolves through the "trnd" (mask-image) icon pack instead. */}
            <TrndIcon name="remove" />
          </button>
        </div>
      </div>
      {isConfirmingDelete && (
        <ConfirmDialog
          title={t('removeFromCache')}
          message={t('pleaseMakeSureYouHaveBackedUpYourNote')}
          cancelText={t('cancelButton')}
          confirmText={t('remove')}
          onCancel={() => setIsConfirmingDelete(false)}
          onConfirm={onConfirmDelete}
        />
      )}
    </div>
  )
}

export default TransactionRow
