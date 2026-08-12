import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAppContext } from '@/context/AppContext'
import { useAccountContext } from '@/context/AccountContext'
import { getSymbol } from '@/lib/networkHelpers'
import { TrndIcon } from '@/components/Icon'

import ShowRecoverKeyModal from './ShowRecoverKeyModal'
import DecryptInfoModal from './DecryptInfoModal'
import RemoveAccountConfirm from './RemoveAccountConfirm'

// Ports modules/account/components/Control/{Control,Header,Statistic,Actions}.vue - the panel
// shown once a Note Account is active in this session.
const Control = () => {
  const { t } = useTranslation()
  const { netId } = useAppContext()
  const { addresses, statistic, isEnabledSaveFile, toggleEnabledSaveFile, getRecoveryKey, decryptNotes, removeAccount } =
    useAccountContext()

  const [revealedKey, setRevealedKey] = useState('')
  const [decryptSummary, setDecryptSummary] = useState<{ spent: number; unSpent: number } | null>(null)
  const [isLoadingNotes, setIsLoadingNotes] = useState(false)
  const [isRemoveConfirmOpen, setIsRemoveConfirmOpen] = useState(false)
  const [actionError, setActionError] = useState('')

  const balances = statistic.reduce<Record<string, number>>((acc, { currency, amount }) => {
    acc[currency] = (acc[currency] || 0) + Number(amount)
    return acc
  }, {})
  const balanceCurrencies = Object.keys(balances)

  const handleLoadAllNotes = async () => {
    setIsLoadingNotes(true)
    setActionError('')
    try {
      const summary = await decryptNotes()
      if (summary) setDecryptSummary(summary)
    } catch {
      setActionError(t('decryptFailed'))
    } finally {
      setIsLoadingNotes(false)
    }
  }

  const handleReveal = async () => {
    setActionError('')
    try {
      const key = await getRecoveryKey()
      if (key) setRevealedKey(key)
      else setActionError(t('decryptFailed'))
    } catch {
      setActionError(t('decryptFailed'))
    }
  }

  if (!addresses) return null

  return (
    <div className="account-box">
      <div className="address">
        <div className="address-item">
          <div className="label">{t('account.account')}</div>
          <div className="value" data-test="note_account_address">
            {addresses.encrypt}
          </div>
        </div>
        <div className="address-item">
          <div className="label">{t('account.backedUpWith')}</div>
          <div className="value is-small">{addresses.backup}</div>
        </div>
      </div>

      <div className="action">
        {balanceCurrencies.length > 0 && (
          <div className="action-item">
            <TrndIcon name="account-balance" size="is-large" />
            <div className="desc">
              {t('account.control.balance').split('{value}')[0]}
              <span className="balance">
                {balanceCurrencies.map((currency, index) => (
                  <span key={currency} className="balance-item">
                    {balances[currency]} {getSymbol(netId, currency)}
                    {index !== balanceCurrencies.length - 1 ? ',' : ''}
                  </span>
                ))}
              </span>
            </div>
          </div>
        )}

        <div className="action-item">
          <TrndIcon name="account-notes" size="is-large" />
          <div className="desc">{t('account.control.loadAllDesc')}</div>
          <button
            type="button"
            className="button is-primary is-outlined"
            disabled={isLoadingNotes}
            data-test="load_all_encrypted_notes_button"
            onClick={handleLoadAllNotes}
          >
            {isLoadingNotes ? '...' : t('account.control.loadAll')}
          </button>
        </div>

        <div className="action-item">
          <TrndIcon name="account-key" size="is-large" />
          <div className="desc">{t('account.control.showRecoveryKeyDesc')}</div>
          <button
            type="button"
            className="button is-primary is-outlined"
            data-test="reveal_current_note_account"
            onClick={handleReveal}
          >
            {t('account.control.showRecoveryKey')}
          </button>
        </div>

        <div className="action-item">
          <TrndIcon name="account-remove" size="is-large" />
          <div className="desc">{t('account.control.removeDesc')}</div>
          <button
            type="button"
            className="button is-primary is-outlined"
            data-test="clear_account_info_button"
            onClick={() => setIsRemoveConfirmOpen(true)}
          >
            {t('account.control.remove')}
          </button>
        </div>

        <div className="action-item has-switch">
          <TrndIcon name="account-file" size="is-large" />
          <div className="desc">{t('account.control.fileDesc')}</div>
          <div data-test="download_notes__config_switch">
            <label className="switch">
              <input type="checkbox" checked={isEnabledSaveFile} onChange={toggleEnabledSaveFile} />
              <span className="check" />
            </label>
          </div>
        </div>
      </div>

      {actionError && <p className="help is-danger">{actionError}</p>}

      {revealedKey && <ShowRecoverKeyModal recoveryKey={revealedKey} onClose={() => setRevealedKey('')} />}
      {decryptSummary && <DecryptInfoModal {...decryptSummary} onClose={() => setDecryptSummary(null)} />}
      {isRemoveConfirmOpen && (
        <RemoveAccountConfirm
          onClose={() => setIsRemoveConfirmOpen(false)}
          onConfirm={() => {
            removeAccount()
            setIsRemoveConfirmOpen(false)
          }}
        />
      )}
    </div>
  )
}

export default Control
