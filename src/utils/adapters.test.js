const { eventsType } = require('@/constants')
const { formatEvents } = require('./adapters')

describe('event adapters', () => {
  it('normalizes viem event args into persisted deposit events', () => {
    expect(
      formatEvents(
        [
          {
            blockNumber: 10n,
            transactionHash: '0xtx',
            args: {
              commitment: '0xcommitment',
              leafIndex: 2n,
              timestamp: 123n
            }
          }
        ],
        eventsType.DEPOSIT
      )
    ).toEqual([
      {
        blockNumber: 10,
        transactionHash: '0xtx',
        commitment: '0xcommitment',
        leafIndex: 2,
        timestamp: 123
      }
    ])
  })

  it('keeps old returnValues events readable while dropping invalid deposit rows', () => {
    expect(
      formatEvents(
        [
          {
            blockNumber: 11,
            transactionHash: '0xold',
            returnValues: {
              commitment: '0xoldcommitment',
              leafIndex: '3',
              timestamp: '456'
            }
          },
          {
            blockNumber: 12,
            transactionHash: '0xbad',
            args: {
              commitment: '0xbad'
            }
          }
        ],
        eventsType.DEPOSIT
      )
    ).toEqual([
      {
        blockNumber: 11,
        transactionHash: '0xold',
        commitment: '0xoldcommitment',
        leafIndex: 3,
        timestamp: 456
      }
    ])
  })
})
