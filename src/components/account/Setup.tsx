import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAppContext } from '@/context/AppContext'
import { useAccountContext } from '@/context/AccountContext'
import { TrndIcon } from '@/components/Icon'
import Tooltip from '@/components/Tooltip'

import SetupAccountModal from './SetupAccountModal'
import RecoverAccountModal from './RecoverAccountModal'
import DecryptInfoModal from './DecryptInfoModal'

// Ports modules/account/components/Setup/{Setup,Header,Actions}.vue - Setup/Header.vue is
// skipped: it shows accounts.backup/accounts.encrypt, but `addresses` is always null before an
// account is loaded (this is exactly the !isSetupAccount branch), so classic's own header there
// renders empty values - nothing meaningful to port.
const Setup = () => {
  const { t } = useTranslation()
  const { wallet } = useAppContext()
  const { isExistAccount, isCheckingAccount, recoverAccountFromChain, decryptNotes } = useAccountContext()

  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false)
  const [isRecoverModalOpen, setIsRecoverModalOpen] = useState(false)
  const [isRecovering, setIsRecovering] = useState(false)
  const [recoverError, setRecoverError] = useState('')
  const [decryptSummary, setDecryptSummary] = useState<{ spent: number; unSpent: number } | null>(null)

  // Mirrors Setup/Actions.vue's isAccountDisabled/isRecoverDisabled + their tooltips. Only the
  // recover path carries the wallet-encryption guard: it needs the wallet's own decrypt RPC to
  // unwrap the on-chain key, which WalletConnect sessions don't offer. Setting up an account
  // stays available there - SetupAccountModal just drops the on-chain backup half of it.
  const isSetupDisabled = isCheckingAccount || isExistAccount || !wallet.isConnected
  const isRecoverDisabled =
    isCheckingAccount || !isExistAccount || !wallet.isConnected || wallet.isWalletEncryptionUnsupported
  const setupTooltip = !wallet.isConnected ? t('connectYourWalletFirst') : t('account.setup.setTooltip')
  const recoverTooltip = wallet.isWalletEncryptionUnsupported
    ? t('mobileWallet.actions.disabled')
    : !wallet.isConnected
      ? t('connectYourWalletFirst')
      : t('account.setup.recTooltip')

  // Mirrors Setup/Actions.vue's handleRecoverAccount - recovers via the connected wallet's own
  // decrypt RPC (no modal, unlike the "enter account key" path) then immediately offers to
  // decrypt+summarize the account's notes.
  const handleRecoverAccount = async () => {
    setIsRecovering(true)
    setRecoverError('')
    try {
      const recovered = await recoverAccountFromChain()
      const summary = await decryptNotes(recovered)
      if (summary) setDecryptSummary(summary)
    } catch (err: any) {
      setRecoverError(t('decryptFailed'))
    } finally {
      setIsRecovering(false)
    }
  }

  return (
    <div className="account-box">
      <div className="action">
        <div className="action-item">
          <TrndIcon name="account-setup" size="is-large" />
          <div className="desc">{t('account.setup.desc')}</div>
          <Tooltip className="is-primary is-top is-large is-multiline" trigger={
            <button
              type="button"
              className="button is-primary is-outlined"
              disabled={isSetupDisabled}
              data-test="button_setup_account"
              onClick={() => setIsSetupModalOpen(true)}
            >
              {t('account.setup.account')}
            </button>
          }>
            {setupTooltip}
          </Tooltip>
        </div>

        <div className="action-item">
          <TrndIcon name="account-recover" size="is-large" />
          <div className="desc">{t('account.setup.recoverDesc')}</div>
          <Tooltip className="is-primary is-top is-large is-multiline" trigger={
            <button
              type="button"
              className="button is-primary is-outlined"
              disabled={isRecoverDisabled || isRecovering}
              data-test="button_recover_account"
              onClick={handleRecoverAccount}
            >
              {isRecovering ? '...' : t('account.setup.recover')}
            </button>
          }>
            {recoverTooltip}
          </Tooltip>
        </div>

        <div className="action-item">
          <TrndIcon name="account-raw" size="is-large" />
          <div className="desc">{t('account.setup.enterRawDesc')}</div>
          <button
            type="button"
            className="button is-primary is-outlined"
            data-test="button_enter_account_key"
            onClick={() => setIsRecoverModalOpen(true)}
          >
            {t('account.setup.enterRaw')}
          </button>
        </div>
      </div>

      {recoverError && <p className="help is-danger">{recoverError}</p>}

      {isSetupModalOpen && <SetupAccountModal onClose={() => setIsSetupModalOpen(false)} />}
      {isRecoverModalOpen && (
        <RecoverAccountModal
          onClose={() => setIsRecoverModalOpen(false)}
          onRecovered={async (recovered) => {
            const summary = await decryptNotes(recovered)
            if (summary) setDecryptSummary(summary)
          }}
        />
      )}
      {decryptSummary && <DecryptInfoModal {...decryptSummary} onClose={() => setDecryptSummary(null)} />}
    </div>
  )
}

export default Setup
