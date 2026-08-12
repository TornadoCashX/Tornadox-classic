import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'

import { useAccountContext } from '@/context/AccountContext'
import { generateAccountKeypair } from '@/services/accountCrypto'
import { useAppContext } from '@/context/AppContext'
import { saveAsFile } from '@/utils'
import Modal from '@/components/Modal'

// Ports modules/account/modals/SetupAccount.vue.
const SetupAccountModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation()
  const { setupAccount, recoverAccountFromKey } = useAccountContext()
  const { wallet } = useAppContext()

  // One keypair generation for the modal's lifetime: the address is kept alongside the key
  // rather than re-derived later, which the auto-backup effect below used to do separately.
  const [{ recoveryKey, accountAddress }] = useState(() => {
    const { privateKey, address } = generateAccountKeypair()
    return { recoveryKey: privateKey.slice(2), accountAddress: address }
  })
  const { copy, label: copyLabel } = useCopyToClipboard()
  // Mirrors SetupAccount.vue's mounted() forcing isSaveOnChain=false for wallets without the
  // encryption RPC: the on-chain backup needs a wallet public key to wrap the account key, which a
  // WalletConnect session can't serve, so those users get the local-only half of the flow.
  const [isSaveOnChain, setIsSaveOnChain] = useState(() => !wallet.isWalletEncryptionUnsupported)
  const [isBackedUp, setIsBackedUp] = useState(false)
  const [warningMessage, setWarningMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // Mirrors SetupAccount.vue's mounted() 1.5s auto-download safeguard, in case the user closes
  // the modal (or the on-chain write fails) without having copied the key themselves.
  useEffect(() => {
    fileTimerRef.current = setTimeout(() => {
      const data = new Blob([recoveryKey], { type: 'text/plain;charset=utf-8' })
      saveAsFile(data, `backup-note-account-key-${accountAddress.slice(0, 10)}.txt`)
    }, 1500)
    return () => clearTimeout(fileTimerRef.current)
  }, [recoveryKey, accountAddress])

  useEffect(() => {
    if (isSaveOnChain) setIsBackedUp(false)
  }, [isSaveOnChain])

  const onSetupAccount = async () => {
    if (!isSaveOnChain) {
      setWarningMessage(t('account.modals.setupAccount.yourRecoveryKeyWontBeSaved'))
      return
    }
    setIsSubmitting(true)
    setWarningMessage('')
    try {
      await setupAccount(recoveryKey)
      onClose()
    } catch (err: any) {
      setWarningMessage(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const setAccount = () => {
    try {
      recoverAccountFromKey(recoveryKey)
      onClose()
    } catch (err: any) {
      setWarningMessage(err.message)
    }
  }

  return (
    <Modal isPinned canCancel={false} title={t('account.modals.setupAccount.title')} onClose={onClose}>
      <div className="note">{t('account.modals.setupAccount.description')}</div>
      <div className="field">
        <div className="label-with-buttons">
          <div className="label">{t('account.modals.setupAccount.label')}</div>
          <button type="button" className="button is-primary-text" onClick={() => copy(recoveryKey)}>
            {copyLabel || t('copy')}
          </button>
        </div>
        <div className="notice is-recovery-key">
          <div className="notice__p">{recoveryKey}</div>
        </div>
      </div>
      <div className="notification main-notification is-info">
        {t('account.modals.setupAccount.isNotSupportedWithHw')}
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={isSaveOnChain}
          disabled={wallet.isWalletEncryptionUnsupported}
          onChange={(e) => setIsSaveOnChain(e.target.checked)}
        />{' '}
        {t('account.modals.setupAccount.saveOnChain')}
      </label>
      {wallet.isWalletEncryptionUnsupported && (
        <div className="notification main-notification is-info">{t('mobileWallet.actions.disabled')}</div>
      )}
      {!isSaveOnChain && (
        <label className="checkbox">
          <input type="checkbox" checked={isBackedUp} onChange={(e) => setIsBackedUp(e.target.checked)} />{' '}
          {t('account.modals.setupAccount.backedUp')}
        </label>
      )}
      {warningMessage && <div className="notification main-notification is-warning">{warningMessage}</div>}
      {!isBackedUp && isSaveOnChain ? (
        <button
          type="button"
          className="button is-primary is-fullwidth"
          disabled={isSubmitting}
          data-test="button_confirm_setup_account"
          onClick={onSetupAccount}
        >
          {isSubmitting ? '...' : t('account.modals.setupAccount.setupAccount')}
        </button>
      ) : (
        <button
          type="button"
          className="button is-primary is-fullwidth"
          disabled={!isBackedUp}
          onClick={setAccount}
        >
          {t('account.modals.setupAccount.setAccount')}
        </button>
      )}
    </Modal>
  )
}

export default SetupAccountModal
