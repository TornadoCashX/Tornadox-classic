const { buildLatestDepositsFromEvents, decodeMulticallNextIndexResults } = require('./statistics')

describe('buildLatestDepositsFromEvents', () => {
  it('sorts by leaf index and keeps only the most recent 10, newest first', () => {
    const events = Array.from({ length: 12 }, (_, i) => ({ leafIndex: i, timestamp: 1000 + i }))
    const formatTimeAgo = (timestamp) => `t${timestamp}`

    const result = buildLatestDepositsFromEvents({ events, formatTimeAgo })

    expect(result).toHaveLength(10)
    expect(result[0]).toEqual({ index: 11, depositTime: 't1011' })
    expect(result[9]).toEqual({ index: 2, depositTime: 't1002' })
  })

  it('handles fewer than 10 events without padding', () => {
    const events = [{ leafIndex: 1, timestamp: 5 }]
    const result = buildLatestDepositsFromEvents({ events, formatTimeAgo: () => 'now' })

    expect(result).toEqual([{ index: 1, depositTime: 'now' }])
  })

  it('does not mutate the input events array', () => {
    const events = [
      { leafIndex: 2, timestamp: 2 },
      { leafIndex: 1, timestamp: 1 }
    ]
    const original = [...events]

    buildLatestDepositsFromEvents({ events, formatTimeAgo: () => 'x' })

    expect(events).toEqual(original)
  })
})

describe('decodeMulticallNextIndexResults', () => {
  it('pairs decoded next-index values back to their pool currency/amount', () => {
    const returnData = ['0xraw1', '0xraw2']
    const pools = [
      { currency: 'eth', amount: '0.1' },
      { currency: 'dai', amount: '100' }
    ]
    const decodeParameter = jest.fn((type, data) => `${type}:${data}`)

    const result = decodeMulticallNextIndexResults({ returnData, pools, decodeParameter })

    expect(result).toEqual([
      { amount: '0.1', currency: 'eth', nextDepositIndex: 'uint256:0xraw1' },
      { amount: '100', currency: 'dai', nextDepositIndex: 'uint256:0xraw2' }
    ])
    expect(decodeParameter).toHaveBeenCalledWith('uint256', '0xraw1')
  })
})
