import { useTranslation } from 'react-i18next'

import { interpolate } from '@/utils/i18nFormat'

import Modal from './Modal'

const TokenRiskModal = ({ symbol, onContinue, onClose }: { symbol: string; onContinue: () => void; onClose: () => void }) => {
  const { t } = useTranslation()

  return (
    <Modal title={t('information')} onClose={onClose}>
      <div className="note">{interpolate(t('freezeRisk'), { currency: symbol })}</div>
      <button type="button" className="button is-primary is-fullwidth" onClick={onContinue}>
        {t('close')}
      </button>
    </Modal>
  )
}

export default TokenRiskModal
