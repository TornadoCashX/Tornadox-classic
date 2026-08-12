// Loads and validates the single built-in relayer configured for each chain.
import axios from 'axios'

import { buildRelayerSelection, fetchRelayerStatus, validateRelayerStatus } from '@/services/relayerClient'
import { getRelayerConfig } from '@/config/publicEnv'

export interface SelectedRelayer {
  isValid: true
  name: string
  url: string
  address: string
  tornadoServiceFee: number
  ethPrices: Record<string, string>
}

export const getConfiguredRelayer = (netId: number) => {
  const env = getRelayerConfig() as { getConfiguredRelayer: (netId: number) => { name: string; url: string } }
  return env.getConfiguredRelayer(netId)
}

// A missing or unhealthy built-in relayer disables withdrawal for that chain. There is no
// custom URL or ENS fallback: all withdrawals use the operator-configured endpoint.
export const setupDefaultRelayer = async (netId: number): Promise<SelectedRelayer | null> => {
  const { url, name } = getConfiguredRelayer(netId)
  if (!url) return null

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) return null

    const { url: realUrl, status } = await fetchRelayerStatus({ axios, relayerUrl: parsed.toString() })
    const validation = validateRelayerStatus({ status, netId })
    if (!validation.isValid) return null

    return buildRelayerSelection({ name: name || 'Relayer', realUrl, status }) as SelectedRelayer
  } catch {
    return null
  }
}
