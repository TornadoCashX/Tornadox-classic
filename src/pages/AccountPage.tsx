import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { useAppContext } from '@/context/AppContext'
import { useAccountContext } from '@/context/AccountContext'
import { TrndIcon } from '@/components/Icon'
import ConnectButton from '@/components/ConnectButton'

import Setup from '@/components/account/Setup'
import Control from '@/components/account/Control'

// Ports modules/account/Page.vue (+ NoteAccount.vue's highlight/scroll behavior) - the /account route.
const AccountPage = () => {
  const { t } = useTranslation()
  const { wallet } = useAppContext()
  const { isSetupAccount, isHighlightedNoteAccount, highlightNoteAccount, refreshAccountExistence } =
    useAccountContext()

  const noteRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!wallet.address || isSetupAccount) return
    refreshAccountExistence().catch((error) => {
      console.error('refreshAccountExistence', error)
    })
  }, [wallet.address, isSetupAccount, refreshAccountExistence])

  // Mirrors NoteAccount.vue's isHighlightedNoteAccount watcher: scroll the panel into view and
  // flash it briefly, used by the Navbar Indicator's "Connect Note Account" link.
  useEffect(() => {
    if (!isHighlightedNoteAccount) return
    const el = noteRef.current
    const showTimer = setTimeout(() => {
      el?.classList.add('is-active')
      el?.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'start' })
    }, 100)
    const hideTimer = setTimeout(() => {
      el?.classList.remove('is-active')
      highlightNoteAccount(false)
    }, 1000)
    return () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
    }
  }, [isHighlightedNoteAccount, highlightNoteAccount])

  return (
    <div className="account">
      <h1 className="title">{t('wallet')}</h1>
      <div className="account-box">
        <div className="address">
          <div className="address-item">
            <div className="label">{t('account.wallet.label')}</div>
            <div className="value">{wallet.address || '-'}</div>
          </div>
        </div>
        <div className="action">
          <div className="action-item">
            <TrndIcon name="account-wallet" size="is-large" />
            <div className="desc">{wallet.isConnected ? t('account.wallet.disconnect') : t('account.wallet.desc')}</div>
            {wallet.isConnected ? (
              <button type="button" className="button is-primary is-outlined" data-test="button_disconnect_account" onClick={wallet.disconnect}>
                {t('account.wallet.logout')}
              </button>
            ) : (
              <ConnectButton className="is-primary is-outlined" />
            )}
          </div>
        </div>
      </div>

      <div ref={noteRef} className="note-account">
        <h2 className="title">{t('account.title')}</h2>
        {/* Mirrors Buefy's <b-notification>: it renders a .media > .media-content wrapper around
            the text - .main-notification itself is padding:0/overflow:hidden, with all the
            fit-to-content padding/centering living on .media-content, so omitting that inner
            wrapper (this component's previous shape) left the text sitting unpadded/uncentered
            flush against the border. */}
        <div className="notification main-notification is-info">
          <div className="media">
            <div className="media-content">{t('account.description')}</div>
          </div>
        </div>
        {isSetupAccount ? <Control /> : <Setup />}
      </div>
    </div>
  )
}

export default AccountPage
