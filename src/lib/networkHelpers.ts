import networkConfig from '@/networkConfig'
import { getResolvedRpcUrl } from './rpcSelect'

type NetworkConfigMap = Record<string, any>

const config = networkConfig as unknown as NetworkConfigMap

export const getNetworkConfig = (netId: number) => config[`netId${netId}`]

// Prefers whatever rpcSelect.ts's health-check has resolved for netId (see ensureRpcSelected -
// call that first whenever you're about to do real RPC work for a network the user just
// switched to). Falls back to networkConfig.js's first-listed RPC when nothing's resolved yet
// (e.g. very first render, before any ensureRpcSelected call has completed).
export const getCurrentRpcUrl = (netId: number): string => {
  const resolved = getResolvedRpcUrl(netId)
  if (resolved) return resolved

  const [rpc] = Object.values(getNetworkConfig(netId).rpcUrls) as Array<{ url: string }>
  return rpc.url
}

export const getSymbol = (netId: number, currency: string): string => {
  const tokens = getNetworkConfig(netId).tokens
  return tokens[currency]?.symbol || currency.toUpperCase()
}

export const getExplorerUrl = (netId: number) => getNetworkConfig(netId).explorerUrl as {
  tx: string
  address: string
  block: string
}

// Matches NetworkNavbarIcon.vue's iconName computed property: derives the
// `trnd-{slug}` icon class from the network's display name.
export const getNetworkIconSlug = (netId: number): string => {
  return getNetworkConfig(netId).networkName.replace(/\)?\s\(?/g, '-').toLowerCase()
}

// Matches NetworkModal.vue's `networks` computed: one entry per configured chain, in
// networkConfig.js's declaration order.
export const getAllNetworks = (): Array<{ chainId: number; name: string; dataTest: string }> => {
  return Object.keys(config).map((key) => {
    const name = config[key].networkName as string
    return {
      chainId: Number(key.replace('netId', '')),
      name,
      dataTest: `${name.split(' ').join('_')}__network`
    }
  })
}

export const getShortNetworkName = (netId: number): string => {
  switch (netId) {
    case 1:
      return 'Ethereum'
    case 56:
      return 'BSC Mainnet'
    case 137:
      return 'Polygon Network'
    case 42161:
      return 'Arbitrum'
    case 43114:
      return 'Avalanche'
    case 11155111:
      return 'Sepolia'
    default:
      return getNetworkConfig(netId).networkName
  }
}
