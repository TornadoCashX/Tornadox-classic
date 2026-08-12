import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { useNotice } from '@/context/NoticeContext'
import { trackTxInBackground, type TxReceiptResult } from '@/lib/txWatcher'
import { interpolate } from '@/utils/i18nFormat'

interface TrackTransactionNoticeParams {
  netId: number
  txHash: string
  /** Rendered into the pending/success titles' `{value}` slot, e.g. "0.1 ETH". */
  valueLabel: string
  /** i18n key for the persistent "in progress" notice, e.g. 'depositing'. */
  pendingKey: string
  /** i18n key for the notice it resolves to once mined, e.g. 'depositedValue'. */
  successKey: string
  /** Prefix for the console error on failure, e.g. 'deposit tx'. */
  logLabel: string
  onConfirmed?: (result: TxReceiptResult) => void
  onFailed?: (error: unknown) => void
}

// Mirrors classic's notice/addNotice + isAwait:false pattern around store/metamask.js's
// sendTransaction (see services/depositFlow.js / Withdraw.vue's onWithdraw): a wallet only tells
// us the tx was *broadcast*, so both flows post a persistent "Depositing/Withdrawing X ETH"
// notice, keep it up while the receipt is polled in the background, then resolve it to
// success (auto-dismissing after 10s) or failure. DepositTab and WithdrawTab each had their own
// verbatim copy of that three-step dance; this is the one copy, with the parts that genuinely
// differ - the i18n keys and any extra bookkeeping - passed in.
export const useTransactionNotice = () => {
  const { t } = useTranslation()
  const notice = useNotice()

  return useCallback(
    ({
      netId,
      txHash,
      valueLabel,
      pendingKey,
      successKey,
      logLabel,
      onConfirmed,
      onFailed
    }: TrackTransactionNoticeParams) => {
      const noticeId = notice.addNotice({
        type: 'loading',
        title: interpolate(t(pendingKey), { value: valueLabel }),
        netId
      })

      trackTxInBackground(
        { netId, txHash },
        {
          onConfirmed: (result) => {
            // Caller-side bookkeeping (e.g. marking the local tx record confirmed) runs before
            // the notice flips, matching the order both call sites already used.
            onConfirmed?.(result)
            notice.updateNotice(
              noticeId,
              { type: 'success', title: interpolate(t(successKey), { value: valueLabel }), txHash },
              10000
            )
          },
          onFailed: (error) => {
            // eslint-disable-next-line no-console
            console.error(`${logLabel} failed`, error)
            onFailed?.(error)
            notice.updateNotice(noticeId, { type: 'danger', title: t('transactionFailed') })
          },
          onUnconfirmed: (error) => {
            console.warn(`${logLabel} confirmation remains unknown`, error)
            notice.updateNotice(noticeId, { type: 'warning', title: t('rpcIsDown'), txHash })
          }
        }
      )
    },
    [notice, t]
  )
}
