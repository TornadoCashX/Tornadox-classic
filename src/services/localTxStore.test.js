const { getTxs, saveTxHashes } = require('./localTxStore')

beforeEach(() => {
  window.localStorage.clear()
})

describe('local transaction reconciliation', () => {
  it('replaces an encrypted deposit record when the same commitment is later spent', () => {
    saveTxHashes(1, 'encryptedTxs', [
      {
        txHash: '0xdeposit',
        commitmentHex: '0xcommitment',
        amount: '0.1',
        currency: 'eth',
        timestamp: 1,
        status: 2,
        isSpent: false
      }
    ])

    saveTxHashes(1, 'encryptedTxs', [
      {
        txHash: '0xwithdrawal',
        commitmentHex: '0xcommitment',
        amount: '0.1',
        currency: 'eth',
        timestamp: 1,
        status: 2,
        isSpent: true,
        depositBlock: 10,
        blockNumber: 20
      }
    ])

    expect(getTxs(1, 'encryptedTxs')).toEqual([
      expect.objectContaining({
        txHash: '0xwithdrawal',
        commitmentHex: '0xcommitment',
        isSpent: true,
        depositBlock: 10,
        blockNumber: 20
      })
    ])
  })

  it('writes a batch with one localStorage update', () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem')

    saveTxHashes(1, 'txs', [
      { txHash: '0xa', amount: '0.1', currency: 'eth', timestamp: 1, status: 2 },
      { txHash: '0xb', amount: '1', currency: 'eth', timestamp: 2, status: 2 }
    ])

    expect(setItem).toHaveBeenCalledTimes(1)
    setItem.mockRestore()
  })
})
