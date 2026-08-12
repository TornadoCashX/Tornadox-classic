import {
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  TransactionReceiptNotFoundError,
  type Address,
  type Hex
} from 'viem'

import InstanceABI from '@/abis/Instance.abi.json'
import TornadoProxyABI from '@/abis/TornadoProxy.abi.json'
import MulticallABI from '@/abis/Multicall.abi.json'
import graph from '@/services/graph'
import { decodeMulticallNextIndexResults } from '@/services/statistics'

import { createRpcClient, readEventLogsChunked } from './eventLogs'
import { getNetworkConfig } from './networkHelpers'
import { withRpcReadRetry } from './rpcSelect'

export const getTornadoProxyAddress = (netId: number): Address => {
  const config = getNetworkConfig(netId)
  return (
    config['tornado-router.contract.tornadocash.eth'] ||
    config['tornado-proxy.contract.tornadocash.eth'] ||
    config['tornado-proxy-light.contract.tornadocash.eth']
  ) as Address
}

export const getInstanceAddress = (netId: number, currency: string, amount: string | number): Address => {
  const config = getNetworkConfig(netId)
  return config.tokens[currency].instanceAddress[amount] as Address
}

// Mirrors modules/account/store/getters/Contract.js's EchoContract - a tiny contract with a
// single `echo(bytes)` function whose sole purpose is to emit an `Echo(address who, bytes data)`
// event, used by the Note Account feature as cheap on-chain storage for the wallet-encrypted
// account keypair (see services/accountCrypto.ts).
const EchoABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'who', type: 'address' },
      { indexed: false, internalType: 'bytes', name: 'data', type: 'bytes' }
    ],
    name: 'Echo',
    type: 'event'
  },
  {
    inputs: [{ internalType: 'bytes', name: '_data', type: 'bytes' }],
    name: 'echo',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
]

export const getEchoAddress = (netId: number): Address => getNetworkConfig(netId).echoContractAccount as Address

export const encodeDepositData = ({
  instanceAddress,
  commitment,
  encryptedNote
}: {
  instanceAddress: string
  commitment: string
  encryptedNote: string | unknown[]
}): Hex =>
  encodeFunctionData({
    abi: TornadoProxyABI,
    functionName: 'deposit',
    args: [instanceAddress as Address, commitment as Hex, (Array.isArray(encryptedNote) ? '0x' : encryptedNote) as Hex]
  })

export const encodeWithdrawData = ({
  instanceAddress,
  proof,
  args
}: {
  instanceAddress: string
  proof: string
  args: string[]
}): Hex =>
  encodeFunctionData({
    abi: TornadoProxyABI,
    functionName: 'withdraw',
    args: [instanceAddress as Address, proof as Hex, ...(args as [Hex, Hex, Address, Address, bigint | string, bigint | string])]
  })

export const encodeEchoData = (payload: string): Hex =>
  encodeFunctionData({
    abi: EchoABI,
    functionName: 'echo',
    args: [payload as Hex]
  })

export interface EchoEvent {
  address: string
  encryptedAccount: string
}

// Mirrors modules/account/store/actions/utils.js's getEventsFromBlockPart: subgraph-first,
// then RPC gap-fills from the subgraph's last-synced block (or the network's NOTE_ACCOUNT_BLOCK
// constant if the subgraph has nothing yet) up to the current block. Returns every Echo event
// emitted by `address` (i.e. every Note Account backup they've ever published on-chain).
export const getEchoEventsForAddress = async (netId: number, address: string): Promise<EchoEvent[]> => {
  const config = getNetworkConfig(netId)

  let graphEvents: EchoEvent[] = []
  let lastSyncBlock: string | number = ''
  try {
    const result = await graph.getNoteAccounts({ address, netId })
    graphEvents = result.events
    lastSyncBlock = result.lastSyncBlock
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`Subgraph query threw for chain ${netId}.`, error)
  }

  // Loud on purpose, and checked on the *value* rather than in the catch above: graph.js's
  // getNoteAccounts swallows its own failures and returns { lastSyncBlock: '', events: [] }, so
  // this branch - not an exception - is what an unusable subgraph actually looks like here.
  // It matters because the RPC fallback below then has to scan from the pool's deploy block
  // instead of the subgraph's head, which on a long-lived chain is orders of magnitude more
  // traffic. Seen in practice on Sepolia as the gateway returning
  // "auth error: subgraph not authorized by user" for a key that lacks access to that subgraph.
  if (lastSyncBlock === '' || lastSyncBlock == null) {
    // eslint-disable-next-line no-console
    console.warn(
      `Subgraph returned no sync block for chain ${netId}; falling back to a full RPC log scan ` +
        `from block ${config.constants.NOTE_ACCOUNT_BLOCK}. Check this chain's Graph API key.`
    )
  }

  return withRpcReadRetry(netId, async (rpcUrl) => {
    const client = createRpcClient(rpcUrl)
    const currentBlockNumber = Number(await client.getBlockNumber())
    const fromBlock =
      lastSyncBlock !== '' && lastSyncBlock != null ? Number(lastSyncBlock) : config.constants.NOTE_ACCOUNT_BLOCK

    if (fromBlock > currentBlockNumber) return graphEvents

    const partOfEvents = await readEventLogsChunked(client, {
      address: config.echoContractAccount as Address,
      abi: EchoABI as any,
      eventName: 'Echo',
      fromBlock,
      toBlock: currentBlockNumber,
      filter: { who: address },
      netId
    })

    return graphEvents.concat(
      partOfEvents.map((event: any) => ({
        address: event.args.who,
        encryptedAccount: event.args.data
      }))
    )
  })
}

export interface EncryptedNoteEvent {
  txHash: string
  encryptedNote: string
  transactionHash: string
  blockNumber: number
}

// Mirrors store/application.js's getEncryptedNotes (simplified: no IndexedDB caching layer -
// this is a manual, occasional "decrypt my notes" action, not a hot path). Subgraph-first via
// the already-ported graph.getAllEncryptedNotes, then a single RPC gap-fill for anything not
// yet indexed, reading the TornadoProxy contract's own EncryptedNote event log.
export const getAllEncryptedNoteEvents = async (netId: number): Promise<EncryptedNoteEvent[]> => {
  const config = getNetworkConfig(netId)
  const deployedBlock = config.constants.ENCRYPTED_NOTES_BLOCK

  const { events: graphEvents, lastSyncBlock } = await graph.getAllEncryptedNotes({ netId, fromBlock: deployedBlock })
  const fromBlock = lastSyncBlock || deployedBlock

  return withRpcReadRetry(netId, async (rpcUrl) => {
    const client = createRpcClient(rpcUrl)
    const currentBlockNumber = Number(await client.getBlockNumber())
    let rpcEvents: EncryptedNoteEvent[] = []

    if (fromBlock <= currentBlockNumber) {
      const proxyAddress =
        config['tornado-router.contract.tornadocash.eth'] ||
        config['tornado-proxy.contract.tornadocash.eth'] ||
        config['tornado-proxy-light.contract.tornadocash.eth']
      const rawEvents = await readEventLogsChunked(client, {
        address: proxyAddress as Address,
        abi: TornadoProxyABI as any,
        eventName: 'EncryptedNote',
        fromBlock: Number(fromBlock),
        toBlock: currentBlockNumber,
        netId
      })
      rpcEvents = rawEvents.map((event: any) => ({
        txHash: event.transactionHash,
        transactionHash: event.transactionHash,
        encryptedNote: event.args.encryptedNote,
        blockNumber: Number(event.blockNumber)
      }))
    }

    return graphEvents.concat(rpcEvents)
  })
}

// Mirrors store/metamask.js's updateAccountBalance, but reads via the app's configured RPC
// instead of the wallet's own provider (this app only wires an injected-wallet hook, not a
// full web3modal-style provider plugin).
export const getNativeBalance = async (netId: number, address: string): Promise<string> => {
  return withRpcReadRetry(netId, async (rpcUrl) => {
    const balance = await createRpcClient(rpcUrl).getBalance({ address: address as Address })
    return balance.toString(10)
  })
}

export const getTokenBalance = async (netId: number, currency: string, address: string): Promise<bigint> => {
  const tokenAddress = getNetworkConfig(netId).tokens[currency]?.tokenAddress
  if (!tokenAddress) throw new Error(`Token ${currency.toUpperCase()} is not supported on this network`)

  return withRpcReadRetry(netId, async (rpcUrl) => {
    return createRpcClient(rpcUrl).readContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address as Address]
    })
  })
}

export const getTokenAllowance = async (
  netId: number,
  currency: string,
  owner: string,
  spender: string
): Promise<bigint> => {
  const tokenAddress = getNetworkConfig(netId).tokens[currency]?.tokenAddress
  if (!tokenAddress) throw new Error(`Token ${currency.toUpperCase()} is not supported on this network`)

  return withRpcReadRetry(netId, async (rpcUrl) => {
    return createRpcClient(rpcUrl).readContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [owner as Address, spender as Address]
    })
  })
}

// Plain chain reads the compliance report and transaction watcher need. They keep the app's
// configured RPC selection/retry behavior while using viem for the simple JSON-RPC calls.
export const getTransactionReceipt = async (netId: number, txHash: string) => {
  return withRpcReadRetry(netId, async (rpcUrl) => {
    try {
      return await createRpcClient(rpcUrl).getTransactionReceipt({ hash: txHash as Hex })
    } catch (error) {
      if (error instanceof TransactionReceiptNotFoundError) return null
      throw error
    }
  })
}

export const getBlock = async (netId: number, blockNumber: number | string) => {
  return withRpcReadRetry(netId, (rpcUrl) =>
    createRpcClient(rpcUrl).getBlock({ blockNumber: BigInt(blockNumber) })
  )
}

export const getTransaction = async (netId: number, txHash: string) =>
  withRpcReadRetry(netId, (rpcUrl) => createRpcClient(rpcUrl).getTransaction({ hash: txHash as Hex }))

export const getNextDepositIndex = async (netId: number, currency: string, amount: string | number) => {
  return withRpcReadRetry(netId, async (rpcUrl) => {
    const nextIndex = await createRpcClient(rpcUrl).readContract({
      address: getInstanceAddress(netId, currency, amount),
      abi: InstanceABI,
      functionName: 'nextIndex'
    } as any)
    return Number(nextIndex)
  })
}

export type NextDepositIndexMap = Record<string, Record<string, number>>

// Batch every pool's nextIndex() read into one Multicall aggregate() call so rendered rows can
// reuse shared state instead of triggering one RPC request per currency/amount pool.
export const loadAllNextDepositIndexes = async (netId: number): Promise<NextDepositIndexMap> => {
  const config = getNetworkConfig(netId)
  return withRpcReadRetry(netId, async (rpcUrl) => {
    const pools: Array<{ currency: string; amount: string; target: string; callData: string }> = []

    for (const [currency, token] of Object.entries<any>(config.tokens)) {
      for (const [amount, address] of Object.entries<any>(token.instanceAddress || {})) {
        if (!address) continue
        pools.push({
          currency,
          amount,
          target: address,
          callData: encodeFunctionData({ abi: InstanceABI, functionName: 'nextIndex' })
        })
      }
    }

    if (!pools.length) return {}

    const [, returnData] = await createRpcClient(rpcUrl).readContract({
      address: config.multicall as Address,
      abi: MulticallABI,
      functionName: 'aggregate',
      args: [pools.map(({ target, callData }) => ({ target: target as Address, callData: callData as Hex }))]
    } as any) as readonly [bigint, Hex[]]

    const decoded = decodeMulticallNextIndexResults({
      returnData,
      pools,
      decodeParameter: (_type: string, data: string) =>
        decodeFunctionResult({ abi: InstanceABI, functionName: 'nextIndex', data: data as Hex })
    })

    const result: NextDepositIndexMap = {}
    decoded.forEach(({ currency, amount, nextDepositIndex }: { currency: string; amount: string; nextDepositIndex: any }) => {
      result[currency] = result[currency] || {}
      result[currency][amount] = Number(nextDepositIndex)
    })
    return result
  })
}

// Keep a small safety buffer around eth_estimateGas so wallet submits are less likely to run short.
export const estimateGasWithBuffer = async (
  netId: number,
  transaction: { from: string; to: string; data: string; value?: string },
  bufferPercent = 20
) => {
  return withRpcReadRetry(netId, async (rpcUrl) => {
    const estimated = await createRpcClient(rpcUrl).estimateGas({
      account: transaction.from as Address,
      to: transaction.to as Address,
      data: transaction.data as Hex,
      value: transaction.value ? BigInt(transaction.value) : undefined
    })
    return Math.ceil(Number(estimated) * (1 + bufferPercent / 100))
  })
}

export const isKnownRoot = async (
  netId: number,
  currency: string,
  amount: string | number,
  root: string
): Promise<boolean> =>
  withRpcReadRetry(netId, (rpcUrl) =>
    createRpcClient(rpcUrl).readContract({
      address: getInstanceAddress(netId, currency, amount),
      abi: InstanceABI,
      functionName: 'isKnownRoot',
      args: [root as Hex]
    } as any) as Promise<boolean>
  )
