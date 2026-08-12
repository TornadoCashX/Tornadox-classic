import { useCallback, useEffect, useMemo } from 'react'
import { useAccount, useDisconnect, useSendTransaction, useSwitchChain } from 'wagmi'
import { getWalletClient } from '@wagmi/core'

import { wagmiConfig } from '@/wagmi'

// Wagmi-backed wallet API for app flows. RainbowKit/wagmi now own EIP-6963 wallet discovery,
// WalletConnect v2 session management, reconnect, chain switching and transaction dispatch.
export type ProviderName = string | null

export interface WalletState {
  address: string | null
  netId: number | null
  isConnecting: boolean
  providerName: ProviderName
}

// The previous hand-rolled hook persisted its own session-resume state under these keys; wagmi
// has its own persistence under different keys, so the old ones are just stale litter now.
const LEGACY_PROVIDER_STORAGE_KEY = 'provider'
const LEGACY_NET_ID_STORAGE_KEY = 'netId'

export const useWallet = () => {
  const { address, chainId, connector, isConnected, isConnecting } = useAccount()
  const { disconnectAsync } = useDisconnect()
  const { switchChainAsync } = useSwitchChain()
  const { sendTransactionAsync } = useSendTransaction()
  useEffect(() => {
    window.localStorage.removeItem(LEGACY_PROVIDER_STORAGE_KEY)
    window.localStorage.removeItem(LEGACY_NET_ID_STORAGE_KEY)
  }, [])

  const disconnect = useCallback(async () => {
    await disconnectAsync()
  }, [disconnectAsync])

  const switchChain = useCallback(
    async (netId: number) => {
      await switchChainAsync({ chainId: netId })
    },
    [switchChainAsync]
  )

  const sendWalletTransaction = useCallback(
    async (tx: {
      chainId: number
      to: string
      data: string
      value?: string
      gas?: string
    }): Promise<string> => {
      return sendTransactionAsync({
        chainId: tx.chainId,
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        value: tx.value ? BigInt(tx.value) : undefined,
        gas: tx.gas ? BigInt(tx.gas) : undefined
      })
    },
    [sendTransactionAsync]
  )

  // Wallet-encryption methods are not standard EIP-1193 or typed viem actions. They are still
  // required by the Note Account backup/recovery flow, so they are isolated here as explicit raw
  // wallet RPC calls and gated away from WalletConnect sessions in the account UI.
  //
  // Uses @wagmi/core's imperative getWalletClient(config) instead of the reactive useWalletClient()
  // hook: that hook's data is populated by a React Query fetch that only *starts* once isConnected
  // flips true, so a caller reading its `data` field can race ahead of it actually resolving (the
  // fetch commonly takes a second or so - confirmed via testing) and see undefined even though the
  // wallet is genuinely connected. The imperative action awaits the same resolution fresh on every
  // call instead of depending on a snapshot React happened to have already rendered.
  const requestWalletEncryptionPublicKey = useCallback(async (address: string): Promise<string> => {
    const walletClient = await getWalletClient(wagmiConfig)
    return walletClient.request({ method: 'eth_getEncryptionPublicKey', params: [address] } as any)
  }, [])

  const decryptWithWallet = useCallback(async (encryptedData: string, address: string): Promise<string> => {
    const walletClient = await getWalletClient(wagmiConfig)
    return walletClient.request({ method: 'eth_decrypt', params: [encryptedData, address] } as any)
  }, [])

  // Memoized so the identity only changes when something a consumer can actually observe changes.
  // AppContext.tsx depends on this stable object wholesale, so wallet action identity changes stay
  // in sync with the state fields consumers read.
  return useMemo(
    () => ({
      address: address ?? null,
      netId: chainId ?? null,
      isConnecting,
      // The real connected wallet's display name (e.g. "Coinbase Wallet", "Rabby"), not always
      // "metamask" the way the old hand-rolled hook hardcoded it for any injected wallet - used by
      // DepositTab.tsx/WithdrawTab.tsx's "please confirm in {wallet}" messages.
      providerName: connector?.name ?? null,
      disconnect,
      isConnected,
      // WalletConnect-negotiated sessions only speak the plain signing methods they were set up
      // with, not wallet-encryption RPC methods.
      isWalletEncryptionUnsupported: connector?.type === 'walletConnect',
      sendWalletTransaction,
      switchChain,
      requestWalletEncryptionPublicKey,
      decryptWithWallet
    }),
    [
      address,
      chainId,
      isConnecting,
      isConnected,
      connector?.name,
      connector?.type,
      disconnect,
      sendWalletTransaction,
      switchChain,
      requestWalletEncryptionPublicKey,
      decryptWithWallet
    ]
  )
}
