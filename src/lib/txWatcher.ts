import { getTransactionReceipt } from '@/lib/contracts'
import { getCurrentRpcUrl } from '@/lib/networkHelpers'
import { ensureRpcSelected, reselectRpc } from '@/lib/rpcSelect'

// Mirrors store/txHashKeeper.js's runTxWatcher (this.$provider.waitForTxReceipt): polls for a
// mined receipt on a plain wallet-paid transaction (deposit, or a wallet-path withdrawal) - the
// non-relayer equivalent of services/relayerClient.js's pollRelayerJobUntilTerminal. Classic's
// own watcher has no timeout (it polls until the provider resolves a receipt); a generous cap is
// kept here anyway so a transaction that's dropped from the mempool doesn't poll forever.
const DEFAULT_POLL_INTERVAL_MS = 3000
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000

export interface TxReceiptResult {
  status: boolean
  blockNumber: number
}

export class TransactionConfirmationUnknownError extends Error {
  cause?: unknown

  constructor(cause?: unknown) {
    super('Transaction confirmation is still unknown')
    this.name = 'TransactionConfirmationUnknownError'
    this.cause = cause
  }
}

export const waitForTxReceipt = async ({
  netId,
  txHash,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS
}: {
  netId: number
  txHash: string
  pollIntervalMs?: number
  timeoutMs?: number
}): Promise<TxReceiptResult> => {
  await ensureRpcSelected(netId)
  const start = Date.now()
  let lastPollingError: unknown
  const failedRpcUrls: Set<string> = new Set()

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const receipt = await getTransactionReceipt(netId, txHash)
      if (receipt) {
        return { status: receipt.status === 'success', blockNumber: Number(receipt.blockNumber) }
      }
      lastPollingError = undefined
    } catch (error) {
      // Public RPC endpoints fail transiently. A polling transport error says nothing about the
      // transaction's on-chain status, so keep polling until the overall timeout.
      lastPollingError = error
      failedRpcUrls.add(getCurrentRpcUrl(netId))
      try {
        await reselectRpc(netId, failedRpcUrls)
      } catch {
        // Keep the transaction pending. A later poll retries all endpoints after the delay.
        failedRpcUrls.clear()
      }
    }
    if (Date.now() - start > timeoutMs) {
      throw new TransactionConfirmationUnknownError(lastPollingError)
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }
}

// Deliberately not awaited by callers: the caller already has everything it needs (a tx hash) as
// soon as the wallet broadcasts, so confirmation is tracked separately instead of blocking the UI
// for however long mining actually takes.
export const trackTxInBackground = (
  { netId, txHash }: { netId: number; txHash: string },
  {
    onConfirmed,
    onFailed,
    onUnconfirmed
  }: {
    onConfirmed?: (result: TxReceiptResult) => void
    onFailed?: (error: unknown) => void
    onUnconfirmed?: (error: TransactionConfirmationUnknownError) => void
  }
) => {
  waitForTxReceipt({ netId, txHash })
    .then((result) => {
      if (result.status) {
        onConfirmed?.(result)
      } else {
        onFailed?.(new Error('Transaction failed'))
      }
    })
    .catch((error) => {
      if (error instanceof TransactionConfirmationUnknownError) {
        onUnconfirmed?.(error)
        return
      }
      onUnconfirmed?.(new TransactionConfirmationUnknownError(error))
    })
}
