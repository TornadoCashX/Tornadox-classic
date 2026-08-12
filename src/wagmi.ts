import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { walletConnectWallet } from '@rainbow-me/rainbowkit/wallets'
import { mainnet, bsc, optimism, polygon, arbitrum, gnosis, avalanche, sepolia } from 'wagmi/chains'
import type { Config } from 'wagmi'
import { defineChain } from 'viem'

// Ethereum Classic (netId 61, networkConfig.js) isn't in viem's built-in chain list, unlike the
// other 8 chains this app supports - defined manually from the same source of truth.
export const classic = defineChain({
  id: 61,
  name: 'Ethereum Classic',
  nativeCurrency: { name: 'Ether Classic', symbol: 'ETC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://etc.rivet.link'] }
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://etc.blockscout.com' }
  }
})

// getDefaultConfig's own wallet list (the RainbowKit "Configure" docs' default) hardcodes a
// static "Popular" group - Safe, Rainbow, Base, MetaMask, WalletConnect - that's ALWAYS shown
// regardless of whether the wallet is actually installed (each has a downloadUrls entry, so
// useWalletConnectors's `wallet.ready || !!wallet.extensionDownloadUrl` filter lets it through
// either way, just switching between "connect" and "get the extension" prompts). That's not what
// this app wants: only wallets genuinely present in the browser, plus WalletConnect as the
// universal fallback.
//
// Any wallet that announces itself via EIP-6963 (the modern multi-wallet-discovery standard -
// MetaMask, Rainbow, Coinbase, TronLink, etc. all support it) is picked up automatically and
// grouped under "Installed" independent of this list, via wagmi's own multiInjectedProviderDiscovery
// (on by default in createConfig, which getDefaultConfig calls internally) - confirmed repeatedly
// by testing mocked EIP-6963 announcements, which showed up correctly with no entry here at all.
// So this list only needs to supply walletConnectWallet, offered as a connection method
// regardless of what's installed locally.
//
// Deliberately NOT including RainbowKit's `injectedWallet` fallback here (which binds to
// whatever's at the legacy `window.ethereum` singleton for wallets that don't support EIP-6963):
// with two extensions competing for that singleton (e.g. MetaMask + TronLink both installed), it
// produced two real bugs rather than the intended safety net - (1) it can only ever show as a
// generic unbranded "Browser Wallet", never the actual wallet's name/icon, and worse, (2) wagmi's
// reconnectOnMount (on by default) tries to silently restore that ambiguous connection on every
// page load, and when the underlying window.ethereum reference is inconsistent across reloads
// (which it is, with multiple extensions injecting), that reconnect attempt hangs indefinitely -
// isConnecting stays stuck true forever, which is what left the navbar's connect button showing
// "..." rather than "Connect". Since virtually every actively-maintained wallet extension
// supports EIP-6963 today, relying on it exclusively - unambiguous per-wallet identity, no shared
// singleton to race over - is both simpler and more robust than trying to special-case legacy
// injection.
export const wagmiConfig: Config = getDefaultConfig({
  appName: 'Tornado Cash',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '',
  chains: [mainnet, bsc, classic, optimism, polygon, arbitrum, gnosis, avalanche, sepolia],
  wallets: [
    {
      groupName: 'Other',
      wallets: [walletConnectWallet]
    }
  ]
})
