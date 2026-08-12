import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { interpolate } from '@/utils/i18nFormat'

import { BgIcon } from './Icon'
import Modal from './Modal'
import Tooltip from './Tooltip'

export type TokenApprovalAmount = 'exact' | 'unlimited'

const ApproveTokenModal = ({
  symbol,
  amount,
  isApproving,
  error,
  onApprove,
  onClose
}: {
  symbol: string
  amount: number
  isApproving: boolean
  error: string
  onApprove: (approvalAmount: TokenApprovalAmount) => void
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const [approvalAmount, setApprovalAmount] = useState<TokenApprovalAmount>('exact')

  return (
    <Modal
      title={t('approvalIsRequired')}
      onClose={onClose}
      canCancel={!isApproving}
      closeButton={
        isApproving ? <button type="button" className="delete" disabled aria-label={t('close')} /> : undefined
      }
    >
      <div className="note">{interpolate(t('inOrderToUse'), { currency: symbol })}</div>
      <div className="field withdraw-radio">
        <label className="radio radio-relayer">
          <input
            type="radio"
            name="token-approval-amount"
            checked={approvalAmount === 'exact'}
            disabled={isApproving}
            onChange={() => setApprovalAmount('exact')}
          />{' '}
          {amount} {symbol}
        </label>
        <label className="radio radio-metamask">
          <input
            type="radio"
            name="token-approval-amount"
            checked={approvalAmount === 'unlimited'}
            disabled={isApproving}
            onChange={() => setApprovalAmount('unlimited')}
          />{' '}
          {t('unlimited')}{' '}
          <Tooltip
            trigger={
              <button type="button" className="button is-primary has-icon">
                <BgIcon name="info" />
              </button>
            }
          >
            {t('unlimitedTooltip')}
          </Tooltip>
        </label>
      </div>
      {error && <p className="help is-danger">{error}</p>}
      <button
        type="button"
        className="button is-primary is-fullwidth"
        disabled={isApproving}
        onClick={() => onApprove(approvalAmount)}
      >
        {t('enable')}
      </button>
    </Modal>
  )
}

export default ApproveTokenModal
