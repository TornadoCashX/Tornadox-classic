import { useTranslation } from 'react-i18next'
import { ConnectButton as RainbowKitConnectButton } from '@rainbow-me/rainbowkit'

// Ports components/web3Connect/Button.vue's trigger, with RainbowKit's own connect modal replacing
// the old hand-rolled EIP-6963/WalletConnect picker.
// Uses RainbowKit's documented ConnectButton.Custom render-prop pattern
// (rainbowkit.com/docs/custom-connect-button) rather than the useConnectModal() hook directly -
// this is RainbowKit's own sanctioned way to build a custom trigger, and its `mounted` flag is
// the official hydration-safety gate (mirrors the docs' example, adapted to a single button since
// this component is only ever used as a "not connected" trigger - the connected-state UI lives in
// Navbar.tsx's own tooltip, driven by useWallet()).
// Label is always the static "Connect" text (classic's Button.vue never varied it either - loading
// feedback there came from a separate global overlay, not the button label). Deliberately NOT
// wired to wallet.isConnecting: that flag also goes true during wagmi's own silent
// reconnect-on-mount scan (checking every detected connector's isAuthorized() on every fresh page
// load, per @wagmi/core's reconnect() - see wagmi.ts), which has nothing to do with this button
// being clicked and would flash "..." before the user has done anything.
const ConnectButton = ({ className = 'is-primary' }: { className?: string }) => {
  const { t } = useTranslation()

  return (
    <RainbowKitConnectButton.Custom>
      {({ openConnectModal, mounted }) => (
        <button
          type="button"
          className={`button ${className}`}
          data-test="button_connect"
          onClick={openConnectModal}
          disabled={!mounted}
          aria-hidden={!mounted}
        >
          {t('connect')}
        </button>
      )}
    </RainbowKitConnectButton.Custom>
  )
}

export default ConnectButton
