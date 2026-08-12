import { useTranslation } from 'react-i18next'

import { interpolate } from '@/utils/i18nFormat'

import Modal from './Modal'

// Ports components/BalanceModalBox.vue, opened from Deposit.vue's onDeposit() when the
// connected wallet's balance is below the selected deposit amount. Deposit.vue opens it with no
// canCancel override, so it takes Buefy's default.
const BalanceModal = ({
  currency,
  balance,
  onClose
}: {
  currency: string
  balance: string
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const upperCurrency = currency.toUpperCase()

  return (
    <Modal title={t('insufficientBalance')} onClose={onClose}>
      <div className="note">
        {interpolate(t('youDontHaveEnoughTokens'), { currency: upperCurrency, balance })}
      </div>
      <button type="button" className="button is-primary is-fullwidth" onClick={onClose}>
        {t('close')}
      </button>
    </Modal>
  )
}

export default BalanceModal
