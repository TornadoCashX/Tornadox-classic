// Wires the browser-side implementations for the "runtime ports" that services/events.ts,
// services/runtimeAssets.js etc. expect to be configured by the host app (see
// services/runtimeStorage.js, runtimeProgress.js, runtimeAssets.js and README.md).
import networkConfig from '@/networkConfig'
import { configurePublicRuntimeConfig } from '@/config/runtimeConfig'
import { configureRuntimeAssets } from '@/services/runtimeAssets'
import { configureRuntimeProgress } from '@/services/runtimeProgress'
import { configureRuntimeStorage } from '@/services/runtimeStorage'

import { IndexedDB } from './lib/indexedDB'

// Matches config/runtimeConfig.js's CHAIN_IDS - the set of chains this build has relayer/graph
// env vars for.
const CHAIN_IDS = [1, 10, 56, 61, 100, 137, 42161, 43114, 11155111]

const DEPOSIT_INDEXES = [
  { name: 'transactionHash', unique: false },
  { name: 'commitment', unique: true }
]
const WITHDRAWAL_INDEXES = [{ name: 'nullifierHash', unique: true }]
const LAST_EVENT_INDEXES = [{ name: 'name', unique: false }]

const instances = new Map<number, InstanceType<typeof IndexedDB>>()
const initializationPromises = new Map<number, Promise<void>>()
let adaptersConfigured = false

const buildStoresForNetwork = (netId: number, tokens: Record<string, any>, nativeCurrency: string) => {
  const stores: Array<{ name: string; keyPath: string; indexes?: Array<{ name: string; unique: boolean }> }> = [
    { name: 'encrypted_events', keyPath: 'transactionHash' },
    { name: 'lastEvents', keyPath: 'name', indexes: LAST_EVENT_INDEXES }
  ]

  Object.keys(tokens).forEach((token) => {
    Object.keys(tokens[token].instanceAddress).forEach((amount) => {
      if (nativeCurrency === token) {
        stores.push({ name: `stringify_bloom_${netId}_${token}_${amount}`, keyPath: 'hashBloom' })
      }

      stores.push(
        { name: `deposits_${netId}_${token}_${amount}`, keyPath: 'leafIndex', indexes: DEPOSIT_INDEXES },
        {
          name: `withdrawals_${netId}_${token}_${amount}`,
          keyPath: 'blockNumber',
          indexes: WITHDRAWAL_INDEXES
        },
        { name: `stringify_tree_${netId}_${token}_${amount}`, keyPath: 'hashTree' }
      )
    })
  })

  return stores
}

const configurePublicConfig = () => {
  const env = import.meta.env
  const relayers = CHAIN_IDS.reduce<Record<number, { name: string; url: string }>>((result, chainId) => {
    result[chainId] = {
      name: env[`VITE_DEFAULT_RELAYER_NAME_${chainId}`] || '',
      url: env[`VITE_DEFAULT_RELAYER_URL_${chainId}`] || ''
    }
    return result
  }, {})

  // See src/services/graph.js's CHAIN_GRAPH_URLS - without this, every Graph query throws
  // "Graph API key is not configured" and event lookups (withdrawal note validation,
  // statistics) fail silently (the catch blocks in graph.js swallow the error and return empty
  // results, which looks like "no matching deposit" rather than a config problem).
  const graphApiKeys = CHAIN_IDS.reduce<Record<number, string>>((result, chainId) => {
    result[chainId] = env[`VITE_GRAPH_API_KEY_${chainId}`] || ''
    return result
  }, {})

  configurePublicRuntimeConfig({
    relayers,
    graphApiKeys,
    siteUrl: env.VITE_SITE_URL || '',
    walletConnectProjectId: env.VITE_WALLETCONNECT_PROJECT_ID || ''
  })
}

const configureAdapters = () => {
  if (adaptersConfigured) return
  configurePublicConfig()

  configureRuntimeStorage({
    getIndexedDB: (netId: number) => instances.get(netId)
  })

  configureRuntimeProgress({
    reportEventProgress: ({ type, percentage }: { type: string; percentage: number }) => {
      // eslint-disable-next-line no-console
      console.debug(`[events] ${type} ${Math.ceil(percentage * 100)}%`)
    }
  })

  configureRuntimeAssets({
    // public/ (this project's own copy of the cached event/tree bundles and proving keys)
    // is served at the site root by Vite's default publicDir behavior.
    getAssetBaseUrl: () => window.location.origin
  })

  adaptersConfigured = true
}

export const ensureRuntimeConfigured = (netId: number): Promise<void> => {
  configureAdapters()

  const existing = initializationPromises.get(netId)
  if (existing) return existing

  const key = `netId${netId}`
  const config = (networkConfig as Record<string, any>)[key]
  if (!config) return Promise.reject(new Error(`Unsupported network ${netId}`))

  const instance = new IndexedDB({
    stores: buildStoresForNetwork(netId, config.tokens, config.nativeCurrency),
    dbName: `tornado_cash_${netId}`
  })
  instances.set(netId, instance)

  // IndexedDB is an optional cache. initDB marks an unavailable instance as blocked and resolves
  // false; services then fall back to static assets/Graph/RPC instead of losing withdrawal access.
  const initialization = instance.initDB().then(() => undefined)
  initializationPromises.set(netId, initialization)
  return initialization
}
