const {
  buildWithdrawalReport,
  findDepositEvent,
  findWithdrawalEvent,
  fromDecimals,
  isNullifierSpent,
  toDecimals
} = require('./depositLookup')

describe('toDecimals / fromDecimals', () => {
  it('formats base-unit amounts into human decimals', () => {
    expect(toDecimals('1500000000000000000', 18)).toBe('1.5')
    expect(toDecimals('1000000000000000000', 18)).toBe('1')
    expect(toDecimals('-500000000000000000', 18)).toBe('-0.5')
  })

  it('truncates the fraction to `fixed` digits', () => {
    expect(toDecimals('123456789000000000', 18, 4)).toBe('0.1234')
  })

  it('round-trips human decimals back to base units', () => {
    expect(fromDecimals('1.5', 18).toString()).toBe('1500000000000000000')
    expect(fromDecimals('0.1', 18).toString()).toBe('100000000000000000')
  })

  it('rejects malformed decimal strings', () => {
    expect(() => fromDecimals('1.2.3', 18)).toThrow('Too many decimal points')
    expect(() => fromDecimals('1.123456789012345678901', 18)).toThrow('Too many decimal places')
  })
})

describe('buildWithdrawalReport', () => {
  it('subtracts the relayer fee from the deposit amount and formats both', () => {
    const report = buildWithdrawalReport({
      event: { to: '0xrecipient', fee: '10000000000000000', transactionHash: '0xtx', blockNumber: 123 },
      amount: '0.1',
      decimals: 18
    })

    expect(report).toEqual({
      to: '0xrecipient',
      txHash: '0xtx',
      withdrawalBlock: 123,
      fee: '0.01',
      amount: '0.09'
    })
  })
})

describe('event lookups', () => {
  const note = { netId: 1, amount: '0.1', currency: 'eth', commitmentHex: '0xc', nullifierHex: '0xn' }

  it('looks up a deposit event by commitment', async () => {
    const findEvent = jest.fn().mockResolvedValue({ leafIndex: 1 })
    const eventsInterface = { getService: jest.fn(() => ({ findEvent })) }

    const event = await findDepositEvent({ eventsInterface, note })

    expect(eventsInterface.getService).toHaveBeenCalledWith(note)
    expect(findEvent).toHaveBeenCalledWith({ eventName: 'commitment', eventToFind: '0xc', type: 'deposit' })
    expect(event).toEqual({ leafIndex: 1 })
  })

  it('looks up a withdrawal event by nullifier hash', async () => {
    const findEvent = jest.fn().mockResolvedValue({ transactionHash: '0xtx' })
    const eventsInterface = { getService: jest.fn(() => ({ findEvent })) }

    const event = await findWithdrawalEvent({ eventsInterface, note })

    expect(findEvent).toHaveBeenCalledWith({
      eventName: 'nullifierHash',
      eventToFind: '0xn',
      type: 'withdrawal'
    })
    expect(event).toEqual({ transactionHash: '0xtx' })
  })

  it('reports a nullifier as spent only when a withdrawal event is found', async () => {
    const spentEventsInterface = { getService: () => ({ findEvent: jest.fn().mockResolvedValue({}) }) }
    const unspentEventsInterface = {
      getService: () => ({ findEvent: jest.fn().mockResolvedValue(undefined) })
    }

    await expect(isNullifierSpent({ eventsInterface: spentEventsInterface, note })).resolves.toBe(true)
    await expect(isNullifierSpent({ eventsInterface: unspentEventsInterface, note })).resolves.toBe(false)
  })
})
