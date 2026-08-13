import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { useWallet, type WalletState } from '@/hooks/useWallet'
import { getDefaultNetId, getNetworkConfig, isNetworkEnabled } from '@/lib/networkHelpers'
import { type SelectedRelayer } from '@/lib/relayerSetup'
import { ensureRpcSelected } from '@/lib/rpcSelect'

interface AppContextValue {
  netId: number
  setNetId: (netId: number) => void
  selectedCurrency: string
  selectedAmount: number
  setSelectedPool: (currency: string, amount: number) => void
  wallet: WalletState & {
    disconnect: () => Promise<void>
    isConnected: boolean
    isWalletEncryptionUnsupported: boolean
    sendWalletTransaction: (tx: {
      chainId: number
      to: string
      data: string
      value?: string
      gas?: string
    }) => Promise<string>
    switchChain: (netId: number) => Promise<void>
    requestWalletEncryptionPublicKey: (address: string) => Promise<string>
    decryptWithWallet: (encryptedData: string, address: string) => Promise<string>
  }
  // Setup is driven by WithdrawTab (mirrors classic's pages/index.vue only dispatching
  // relayer/setupDefaultRelayer when the Withdraw tab is active), not eagerly here - deposit-only
  // sessions on a chain with no reachable relayer shouldn't see relayer-connection errors.
  selectedRelayer: SelectedRelayer | null
  setSelectedRelayer: (relayer: SelectedRelayer | null) => void
  isLoadingRelayer: boolean
  setIsLoadingRelayer: (isLoading: boolean) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [netId, setNetId] = useState(() => getDefaultNetId())
  const [selectedCurrency, setSelectedCurrency] = useState('eth')
  const [selectedAmount, setSelectedAmount] = useState(0.1)
  const [selectedRelayer, setSelectedRelayer] = useState<SelectedRelayer | null>(null)
  const [isLoadingRelayer, setIsLoadingRelayer] = useState(true)
  const wallet = useWallet()

  const setSelectedPool = (currency: string, amount: number) => {
    setSelectedCurrency(currency)
    setSelectedAmount(amount)
  }

  const handleSetNetId = (nextNetId: number) => {
    if (!isNetworkEnabled(nextNetId)) return

    setNetId(nextNetId)
    const config = getNetworkConfig(nextNetId)
    const currency = config.nativeCurrency
    const amounts = Object.keys(config.tokens[currency].instanceAddress)
    setSelectedPool(currency, Math.min(...amounts.map(Number)))
  }

  // Mirrors store/settings.js's checkCurrentRpc/preselectRpc being triggered on network change:
  // start health-checking networkConfig.js's RPC candidates for the newly active chain right
  // away, so getCurrentRpcUrl() has a resolved, working URL cached by the time other components'
  // own effects (which explicitly await ensureRpcSelected too) get to it.
  useEffect(() => {
    // This is only a best-effort prewarm. Real read paths await selection and surface their own
    // errors, so an outage here must not become an unhandled rejection or a permanent app error.
    void ensureRpcSelected(netId).catch(() => undefined)
  }, [netId])

  // Mirrors store/metamask.js's onChainChanged -> onNetworkChanged: once a wallet is connected,
  // it is the source of truth for which chain is active. This follows wallet.netId whether it
  // changed because our own NetworkModal called wallet.switchChain (see Navbar.tsx) or because
  // the user switched networks directly inside their wallet extension - either way Deposit and
  // Withdraw need to end up looking at the same chain the wallet will actually sign against.
  useEffect(() => {
    if (
      wallet.isConnected &&
      wallet.netId !== null &&
      wallet.netId !== netId &&
      isNetworkEnabled(wallet.netId) &&
      getNetworkConfig(wallet.netId)
    ) {
      handleSetNetId(wallet.netId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.isConnected, wallet.netId])

  const value = useMemo<AppContextValue>(
    () => ({
      netId,
      setNetId: handleSetNetId,
      selectedCurrency,
      selectedAmount,
      setSelectedPool,
      wallet,
      selectedRelayer,
      setSelectedRelayer,
      isLoadingRelayer,
      setIsLoadingRelayer
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      netId,
      selectedCurrency,
      selectedAmount,
      // useWallet memoizes its own return value, so depending on the whole object tracks every
      // field consumers read - including wallet encryption support and callbacks. Listing
      // individual fields here (as this once did) meant anything left off silently went stale.
      wallet,
      selectedRelayer,
      isLoadingRelayer
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export const useAppContext = () => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}
