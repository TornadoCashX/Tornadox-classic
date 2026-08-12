import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useConnectModal } from '@rainbow-me/rainbowkit'

import { useAppContext } from '@/context/AppContext'
import {
  getExplorerUrl,
  getNetworkConfig,
  getNetworkIconSlug,
  getShortNetworkName,
  getSymbol
} from '@/lib/networkHelpers'
import { getNativeBalance } from '@/lib/contracts'
import { toDecimals } from '@/services/depositLookup'
import { sliceAddress } from '@/utils'

import Logo from './Logo'
import { TrndIcon } from './Icon'
import Tooltip from './Tooltip'
import NetworkModal from './NetworkModal'
import ConnectButton from './ConnectButton'
import AccountIndicator from './AccountIndicator'
import WalletConnectReconnectModal from './WalletConnectReconnectModal'
import './Navbar.scss'

const Navbar = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { netId, setNetId, wallet } = useAppContext()
  const { openConnectModal } = useConnectModal()
  const [isNetworkModalOpen, setIsNetworkModalOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [balance, setBalance] = useState('0')
  // Set while a chain-switch attempt failed for a WalletConnect-type connector and needs the
  // user's confirmation before disconnecting + re-pairing (see the onSelect handler below).
  const [reconnectNetId, setReconnectNetId] = useState<number | null>(null)

  // Mirrors store/metamask.js's ethBalance, shown in the MetaMask tooltip once connected.
  useEffect(() => {
    if (!wallet.address) {
      setBalance('0')
      return
    }
    let cancelled = false
    setBalance('0')

    const loadBalance = async () => {
      return getNativeBalance(netId, wallet.address as string)
    }

    loadBalance()
      .then((wei) => {
        if (!cancelled) {
          setBalance(
            toDecimals(
              wei,
              getNetworkConfig(netId).tokens[getNetworkConfig(netId).nativeCurrency].decimals,
              6
            )
          )
        }
      })
      .catch((error) => {
        if (!cancelled) setBalance('0')
        // eslint-disable-next-line no-console
        console.warn(`Balance update failed for chain ${netId}:`, error)
      })
    return () => {
      cancelled = true
    }
  }, [netId, wallet.address])

  return (
    <nav className="navbar header" role="navigation" aria-label="main navigation">
      <div className="container">
        <div className="navbar-brand">
          <Link to="/" className="navbar-item" data-test="tornado_main_page" aria-label="Tornado Cash home">
            <Logo />
          </Link>
          <button
            type="button"
            aria-label="menu"
            aria-expanded={isMenuOpen}
            className={`navbar-burger burger ${isMenuOpen ? 'is-active' : ''}`}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
        </div>
        <div className={`navbar-menu ${isMenuOpen ? 'is-active' : ''}`}>
          <div className="navbar-start">
            <Link
              to="/compliance"
              className="navbar-item"
              data-test="compliance_link"
              onClick={() => setIsMenuOpen(false)}
            >
              {t('compliance')}
            </Link>
            <a
              className="navbar-item has-tag"
              href="https://github.com/tornadocash/docs"
              target="_blank"
              rel="noopener noreferrer"
              data-test="docs_link"
            >
              <TrndIcon name="open-book" className="mr-1" />
              <span>{t('docs')}</span>
            </a>
          </div>
          <div className="navbar-end">
            <div className="navbar-item">
              <div className="buttons">
                <button
                  type="button"
                  className="button network-button"
                  data-test="button_network"
                  onClick={() => setIsNetworkModalOpen(true)}
                >
                  <TrndIcon name={getNetworkIconSlug(netId)} />
                  <span>{getShortNetworkName(netId)}</span>
                </button>

                <Tooltip
                  className="is-dark-tooltip is-bottom is-medium"
                  trigger={
                    <button
                      type="button"
                      className={`button is-nav-icon ${wallet.isConnected ? 'metamask' : ''}`}
                    >
                      <TrndIcon name="metamask" />
                    </button>
                  }
                >
                  {wallet.isConnected ? (
                    <>
                      <p>{t('web3connected')}</p>
                      <a
                        href={getExplorerUrl(netId).address + wallet.address}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {sliceAddress(wallet.address ?? '')}
                      </a>
                      <p>
                        {balance} {getSymbol(netId, getNetworkConfig(netId).nativeCurrency)}
                      </p>
                      <button
                        type="button"
                        className="button is-primary-link mb-0"
                        data-test="disconnect_wallet"
                        onClick={wallet.disconnect}
                      >
                        {t('account.wallet.disconnect')}
                      </button>
                    </>
                  ) : (
                    <>
                      <p>{t('notConnected')}</p>
                      <ConnectButton className="is-primary-link mb-0" />
                    </>
                  )}
                </Tooltip>

                <AccountIndicator />

                <button
                  type="button"
                  className="button is-primary is-outlined"
                  data-test="button_settings"
                  onClick={() => navigate('/account')}
                >
                  <TrndIcon name="settings" />
                  <span>{t('settings')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {isNetworkModalOpen && (
        <NetworkModal
          netId={netId}
          onSelect={async (nextNetId) => {
            setIsNetworkModalOpen(false)
            // Mirrors store/metamask.js's networkChangeHandler: once a wallet is connected, it
            // is the source of truth for the active chain, so ask it to switch first - app state
            // then follows via AppContext's wallet.netId sync effect. If the wallet rejects the
            // switch, app state (and Deposit/Withdraw) intentionally stays on the old network,
            // same as classic, rather than showing a chain the wallet isn't actually on.
            if (!wallet.isConnected) {
              setNetId(nextNetId)
              return
            }
            // wagmi's switchNetwork now works uniformly across connector types, including modern
            // WalletConnect v2 sessions that approved more than one chain at pairing time - try it
            // first regardless of connector. Only if that fails for a WalletConnect-type connector
            // specifically does classic's original fallback apply: a session pinned to a single
            // chain can't switch in-place, so confirm-then-disconnect-and-re-pair instead
            // (mobileWalletReconnect).
            try {
              await wallet.switchChain(nextNetId)
            } catch (err) {
              if (wallet.isWalletEncryptionUnsupported) {
                setReconnectNetId(nextNetId)
              } else {
                console.error(err)
              }
            }
          }}
          onClose={() => setIsNetworkModalOpen(false)}
        />
      )}
      {reconnectNetId !== null && (
        <WalletConnectReconnectModal
          networkName={getNetworkConfig(reconnectNetId).networkName}
          onCancel={() => setReconnectNetId(null)}
          onConfirm={async () => {
            // Mirrors mobileWalletReconnect's onLogOut -> initialize({ chosenNetId }) pair.
            // setNetId has to land before the connect modal opens: it reads the target chain from
            // AppContext to decide which chain to pair on. RainbowKit's own modal (themed to
            // match this app) handles the actual re-pairing/QR UI now, not a custom component.
            await wallet.disconnect()
            setNetId(reconnectNetId)
            setReconnectNetId(null)
            openConnectModal?.()
          }}
        />
      )}
    </nav>
  )
}

export default Navbar
