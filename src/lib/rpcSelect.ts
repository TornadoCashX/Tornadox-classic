// networkConfig.js lists several public RPCs per chain (see getCurrentRpcUrl in networkHelpers.ts),
// and the first one isn't always usable. Health-check every built-in endpoint, ignore endpoints
// that are down or report the wrong chain, and pick the fastest healthy one for this session.
import { createPublicClient, http, type Address } from 'viem'

import { getNetworkConfig } from './networkHelpers'

const resolvedRpcUrl: Record<number, string> = {}
const resolutionPromises: Record<number, Promise<string> | undefined> = {}
const resolutionVersions: Record<number, number> = {}
const RPC_TIMEOUT_MS = 8000
const RPC_LOG_PROBE_DEPTH = 1000n

export class NoHealthyRpcError extends Error {
  readonly netId: number
  readonly attemptedUrls: string[]

  constructor(netId: number, attemptedUrls: string[]) {
    super(`No healthy RPC endpoint is available for chain ${netId}`)
    this.name = 'NoHealthyRpcError'
    this.netId = netId
    this.attemptedUrls = attemptedUrls
  }
}

const withTimeout = async <T>(promise: Promise<T>, timeoutMs = RPC_TIMEOUT_MS): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('RPC request timed out')), timeoutMs)
    }) as Promise<never>
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const checkRpc = async (url: string, netId: number): Promise<{ url: string; latencyMs: number } | null> => {
  const started = Date.now()
  try {
    const client = createPublicClient({ transport: http(url) })
    const chainId = await withTimeout(client.getChainId())
    if (Number(chainId) !== Number(netId)) return null

    // Event synchronization depends on eth_getLogs, not only eth_chainId. Probe a recent block:
    // bundled event history and the subgraph provide the old prefix, while RPC fills the recent
    // gap. Requiring every public endpoint to retain the deployment block incorrectly rejects
    // otherwise usable pruned nodes (notably every configured Optimism and BSC endpoint).
    const network = getNetworkConfig(netId)
    const probeAddress = Object.values(network.tokens ?? {})
      .flatMap((token: any) => Object.values(token.instanceAddress ?? {}))
      .find(Boolean) as Address | undefined
    if (!probeAddress) return null
    const currentBlock = await withTimeout(client.getBlockNumber())
    const probeBlock = currentBlock > RPC_LOG_PROBE_DEPTH ? currentBlock - RPC_LOG_PROBE_DEPTH : 0n
    await withTimeout(
      client.getLogs({
        address: probeAddress,
        fromBlock: probeBlock,
        toBlock: probeBlock
      })
    )
    return { url, latencyMs: Date.now() - started }
  } catch {
    return null
  }
}

const selectWorkingRpc = async (netId: number, excludedUrls: ReadonlySet<string> = new Set()): Promise<string> => {
  const { rpcUrls } = getNetworkConfig(netId)
  const configured = Object.values(rpcUrls) as Array<{ name: string; url: string }>
  const allCandidates = Array.from(new Set(configured.map(({ url }) => url).filter(Boolean))) as string[]
  const candidates = allCandidates.filter((url) => !excludedUrls.has(url))
  if (!allCandidates.length) throw new NoHealthyRpcError(netId, [])

  const healthy = (await Promise.all(candidates.map((url) => checkRpc(url, netId))))
    .filter((result): result is { url: string; latencyMs: number } => Boolean(result))
    .sort((a, b) => a.latencyMs - b.latencyMs)

  if (healthy[0]) return healthy[0].url

  throw new NoHealthyRpcError(netId, candidates.length ? candidates : allCandidates)
}

// Resolves (and memoizes, per netId) a working RPC URL for the chain, health-checking
// networkConfig.js's candidates in order and falling back through the list. Call this before
// getCurrentRpcUrl() whenever you're about to do real RPC work for a network the user just
// switched to.
export const ensureRpcSelected = (netId: number): Promise<string> => {
  if (resolvedRpcUrl[netId]) return Promise.resolve(resolvedRpcUrl[netId])

  if (!resolutionPromises[netId]) {
    const version = resolutionVersions[netId] ?? 0
    resolutionPromises[netId] = selectWorkingRpc(netId)
      .then((url) => {
        if ((resolutionVersions[netId] ?? 0) !== version) {
          return resolvedRpcUrl[netId] || url
        }
        resolvedRpcUrl[netId] = url
        return url
      })
      .finally(() => {
        resolutionPromises[netId] = undefined
      })
  }

  return resolutionPromises[netId] as Promise<string>
}

// Synchronous read of whatever was last resolved for netId, if anything - used by
// getCurrentRpcUrl() as a cache in front of networkConfig.js's naive first-entry default.
export const getResolvedRpcUrl = (netId: number): string | undefined => resolvedRpcUrl[netId]

// Invalidates a failed selection and probes the remaining endpoints. The exclusion applies only
// to this retry, so a later user action can probe every configured endpoint again after a
// temporary outage has recovered.
export const reselectRpc = async (netId: number, failedUrls: Iterable<string>): Promise<string> => {
  const excludedUrls = new Set(failedUrls)
  resolutionVersions[netId] = (resolutionVersions[netId] ?? 0) + 1
  if (resolvedRpcUrl[netId] && excludedUrls.has(resolvedRpcUrl[netId])) {
    delete resolvedRpcUrl[netId]
  }

  const version = resolutionVersions[netId]
  const url = await selectWorkingRpc(netId, excludedUrls)
  if (resolutionVersions[netId] === version) resolvedRpcUrl[netId] = url
  return resolvedRpcUrl[netId] || url
}

// Retries an idempotent public-RPC read across the remaining healthy endpoints. Never use this
// around wallet transaction submits, relayer POSTs, or any other write: a lost response does not prove
// that a write failed, so replaying it could submit the same action twice.
export const withRpcReadRetry = async <T>(
  netId: number,
  read: (rpcUrl: string) => Promise<T>
): Promise<T> => {
  const configured = Object.values(getNetworkConfig(netId).rpcUrls) as Array<{ url: string }>
  const maxAttempts = new Set(configured.map(({ url }) => url).filter(Boolean)).size
  const failedUrls = new Set<string>()
  let rpcUrl = await ensureRpcSelected(netId)
  let firstError: unknown

  while (failedUrls.size < maxAttempts) {
    try {
      return await read(rpcUrl)
    } catch (error) {
      firstError ??= error
      failedUrls.add(rpcUrl)
      if (failedUrls.size >= maxAttempts) break
      try {
        rpcUrl = await reselectRpc(netId, failedUrls)
      } catch {
        break
      }
    }
  }

  throw firstError
}

// Programmatic override used by tests and internal tooling only. Normal app runtime deliberately
// uses built-in RPC candidates and chooses the fastest healthy endpoint itself.
export const setResolvedRpcUrl = (netId: number, url: string): void => {
  resolutionVersions[netId] = (resolutionVersions[netId] ?? 0) + 1
  resolvedRpcUrl[netId] = url
}
