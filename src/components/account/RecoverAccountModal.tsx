import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAccountContext, type RecoveredAccount } from '@/context/AccountContext'
import { isValidAccountPrivateKey } from '@/services/accountCrypto'
import Modal from '@/components/Modal'

// Ports modules/account/modals/RecoverAccount.vue. `onRecovered` mirrors the `getNotes` prop
// classic passes in - called after a successful recovery so the caller can immediately offer to
// decrypt+summarize the account's notes.
const RecoverAccountModal = ({
  onClose,
  onRecovered
}: {
  onClose: () => void
  onRecovered: (recovered: RecoveredAccount) => void | Promise<void>
}) => {
  const { t } = useTranslation()
  const { recoverAccountFromKey } = useAccountContext()

  const [recoveryKey, setRecoveryKey] = useState('')
  const [isValid, setIsValid] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const hasInvalidKey = Boolean(recoveryKey) && !isValid

  const onInput = (value: string) => {
    setRecoveryKey(value)
    setErrorMessage('')
    setIsValid(isValidAccountPrivateKey(value))
  }

  const handleRecoverAccount = async () => {
    setIsSubmitting(true)
    setErrorMessage('')
    try {
      const recovered = recoverAccountFromKey(recoveryKey)
      await onRecovered(recovered)
      onClose()
    } catch (err: any) {
      setErrorMessage(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal isPinned title={t('account.modals.recoverAccount.title')} onClose={onClose}>
      <div className="note">{t('account.modals.recoverAccount.description')}</div>
      <div className="field">
        <textarea
          className={`textarea is-disabled-resize ${hasInvalidKey ? 'is-warning' : ''}`}
          rows={2}
          placeholder={t('enterRecoveryKey')}
          data-test="input_enter_recovery_key"
          value={recoveryKey}
          onChange={(e) => onInput(e.target.value.trim())}
        />
        {hasInvalidKey && <p className="help is-warning">{t('account.modals.recoverAccount.warning')}</p>}
      </div>
      {errorMessage && <div className="notification main-notification is-warning">{errorMessage}</div>}
      <button
        type="button"
        className="button is-primary is-fullwidth"
        disabled={!recoveryKey || hasInvalidKey || isSubmitting}
        data-test="button_connect_recovery_key"
        onClick={handleRecoverAccount}
      >
        {isSubmitting ? '...' : t('account.modals.recoverAccount.connect')}
      </button>
    </Modal>
  )
}

export default RecoverAccountModal
