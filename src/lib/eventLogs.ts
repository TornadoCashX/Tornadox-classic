import {
  createPublicClient,
  getAbiItem,
  http,
  type Address,
  type Abi,
  type HttpTransportConfig,
  type PublicClient
} from 'viem'

import { blockSyncInterval } from '@/networkConfig'

const BSC_BLOCK_RANGE = 4950
const MAX_LOG_BLOCK_RANGE = 100_000
const MIN_LOG_BLOCK_RANGE = blockSyncInterval

export interface NormalizedEventLog {
  blockNumber: number
  transactionHash: string
  args: Record<string, unknown>
}

export interface ReadEventLogsParams {
  address: string
  abi: Abi
  eventName: string
  fromBlock: number
  toBlock: number | 'latest'
  filter?: Record<string, unknown>
}

export const createRpcClient = (rpcUrl: string, options?: HttpTransportConfig) =>
  createPublicClient({ transport: http(rpcUrl, options) })

export const normalizeViemLog = (log: {
  blockNumber?: bigint | number | null
  transactionHash?: string | null
  args?: Record<string, unknown>
}): NormalizedEventLog => ({
  blockNumber: Number(log.blockNumber),
  transactionHash: log.transactionHash || '',
  args: Object.fromEntries(
    Object.entries(log.args || {}).map(([key, value]) => [
      key,
      typeof value === 'bigint' ? value.toString(10) : value
    ])
  )
})

export const readEventLogs = async (
  client: PublicClient,
  { address, abi, eventName, fromBlock, toBlock, filter }: ReadEventLogsParams
): Promise<NormalizedEventLog[]> => {
  const logs = await client.getLogs({
    address: address as Address,
    event: getAbiItem({ abi, name: eventName }) as any,
    args: filter,
    fromBlock: BigInt(fromBlock),
    toBlock: toBlock === 'latest' ? 'latest' : BigInt(toBlock)
  } as any)

  return logs.map(normalizeViemLog)
}

const isBlockRangeError = (error: unknown) =>
  /range|limit|exceed|too many|pruned|too large/i.test((error as Error)?.message ?? '')

// Public RPCs cap how many blocks a single eth_getLogs may span, and the caps differ per
// provider. Start optimistically large and narrow only when the provider rejects the range.
export const readEventLogsChunked = async (
  client: PublicClient,
  params: ReadEventLogsParams & { netId: number }
): Promise<NormalizedEventLog[]> => {
  let range = params.netId === 56 ? BSC_BLOCK_RANGE : MAX_LOG_BLOCK_RANGE
  const collected: NormalizedEventLog[] = []
  let start = params.fromBlock
  const finalBlock = params.toBlock === 'latest' ? Number(await client.getBlockNumber()) : params.toBlock

  while (start <= finalBlock) {
    const end = Math.min(start + range - 1, finalBlock)
    try {
      const part = await readEventLogs(client, { ...params, fromBlock: start, toBlock: end })
      collected.push(...part)
      start = end + 1
    } catch (error) {
      if (!isBlockRangeError(error) || range <= MIN_LOG_BLOCK_RANGE) throw error
      range = Math.max(MIN_LOG_BLOCK_RANGE, Math.floor(range / 2))
    }
  }

  return collected
}
