const { buildConfirmedDepositRecord } = require('./depositConfirmation')

describe('deposit confirmation', () => {
  it('replaces a provisional leaf index with the confirmed Deposit event index', async () => {
    const findEvent = jest.fn().mockResolvedValue({ leafIndex: 16 })
    const record = {
      txHash: '0xtx',
      netId: 1,
      amount: '0.1',
      currency: 'eth',
      commitmentHex: '0xcommitment',
      nullifierHex: '0xnullifier',
      timestamp: 1,
      status: 1,
      index: 15
    }

    await expect(
      buildConfirmedDepositRecord({
        record,
        blockNumber: 123,
        eventsInterface: { getService: () => ({ findEvent }) }
      })
    ).resolves.toMatchObject({ status: 2, blockNumber: 123, index: 16 })

    expect(findEvent).toHaveBeenCalledWith({
      eventName: 'commitment',
      eventToFind: '0xcommitment',
      type: 'deposit'
    })
  })
})
