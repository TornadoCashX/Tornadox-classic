import { useTranslation } from 'react-i18next'

import { interpolate } from '@/utils/i18nFormat'

import ConfirmDialog from './ConfirmDialog'

// Ports the WalletConnect branch of store/metamask.js's networkChangeHandler (a programmatic
// Buefy Dialog.confirm, so there is no .vue component to mirror): a WalletConnect session is
// pinned to the chain it was paired on, so switching networks means tearing the session down
// and pairing again rather than a wallet_switchEthereumChain round trip.
//
// Portaled because the navbar's network button can sit inside a display:none-by-default tooltip
// container.
const WalletConnectReconnectModal = ({
  networkName,
  onCancel,
  onConfirm
}: {
  networkName: string
  onCancel: () => void
  onConfirm: () => void
}) => {
  const { t } = useTranslation()

  return (
    <ConfirmDialog
      portal
      title={t('changeNetwork')}
      message={interpolate(t('mobileWallet.reconnect.message'), { networkName })}
      cancelText={t('cancelButton')}
      confirmText={t('mobileWallet.reconnect.action')}
      onCancel={onCancel}
      onConfirm={onConfirm}
      closeDataTest="close_popup_button"
      confirmDataTest="button_walletconnect_reconnect"
    />
  )
}

export default WalletConnectReconnectModal
