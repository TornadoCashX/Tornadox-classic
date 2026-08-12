const mockGetTransactionReceipt = jest.fn()
const mockReselectRpc = jest.fn().mockResolvedValue('https://second.example')

jest.mock('@/lib/contracts', () => ({
  getTransactionReceipt: (...args) => mockGetTransactionReceipt(...args)
}))

jest.mock('@/lib/networkHelpers', () => ({
  getCurrentRpcUrl: () => 'https://first.example'
}))

jest.mock('@/lib/rpcSelect', () => ({
  ensureRpcSelected: jest.fn().mockResolvedValue('https://first.example'),
  reselectRpc: (...args) => mockReselectRpc(...args)
}))

const { TransactionConfirmationUnknownError, waitForTxReceipt } = require('./txWatcher')

afterEach(() => {
  jest.clearAllMocks()
})

describe('waitForTxReceipt', () => {
  it('retries a transient RPC error instead of treating the transaction as failed', async () => {
    mockGetTransactionReceipt
      .mockRejectedValueOnce(new Error('temporary RPC failure'))
      .mockResolvedValueOnce({ status: 'success', blockNumber: 42n })

    await expect(
      waitForTxReceipt({ netId: 1, txHash: '0xtx', pollIntervalMs: 0, timeoutMs: 100 })
    ).resolves.toEqual({ status: true, blockNumber: 42 })
  })

  it('reports a reverted transaction as failed after it receives a receipt', async () => {
    mockGetTransactionReceipt.mockResolvedValueOnce({ status: 'reverted', blockNumber: 43n })

    await expect(
      waitForTxReceipt({ netId: 1, txHash: '0xtx', pollIntervalMs: 0, timeoutMs: 100 })
    ).resolves.toEqual({ status: false, blockNumber: 43 })
  })

  it('reports a timeout as unknown rather than as an on-chain failure', async () => {
    mockGetTransactionReceipt.mockRejectedValue(new Error('RPC unavailable'))

    await expect(
      waitForTxReceipt({ netId: 1, txHash: '0xtx', pollIntervalMs: 2, timeoutMs: 1 })
    ).rejects.toBeInstanceOf(TransactionConfirmationUnknownError)
  })
})
