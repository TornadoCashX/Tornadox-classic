import { useTranslation } from 'react-i18next'

import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'

import Modal from '@/components/Modal'

// Ports modules/account/modals/ShowRecoverKey.vue - pure display, no store dispatch on submit.
// modals/index.js's openShowRecoverKeyModal passes no canCancel, so it takes Buefy's default.
const ShowRecoverKeyModal = ({ recoveryKey, onClose }: { recoveryKey: string; onClose: () => void }) => {
  const { t } = useTranslation()
  const { copy, label: copyLabel } = useCopyToClipboard()

  return (
    <Modal isPinned title={t('account.modals.showRecoveryKey.title')} onClose={onClose}>
      <div className="field">
        <div className="label-with-buttons">
          <button type="button" className="button is-primary-text" onClick={() => copy(recoveryKey)}>
            {copyLabel || t('copy')}
          </button>
        </div>
        <div className="notice is-recovery-key">
          <div className="notice__p">{recoveryKey}</div>
        </div>
      </div>
      <button type="button" className="button is-primary is-fullwidth" onClick={onClose}>
        {t('account.modals.showRecoveryKey.close')}
      </button>
    </Modal>
  )
}

export default ShowRecoverKeyModal
