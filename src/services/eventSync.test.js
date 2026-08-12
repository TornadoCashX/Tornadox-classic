const {
  createBlockRanges,
  getPersistedEventCursor,
  getNextSyncBlock,
  clampEventCursor,
  mergeEventStreams,
  splitGraphPage
} = require('./eventSync')

describe('event synchronization helpers', () => {
  it('only creates the remaining ranges and stops at the chain head', () => {
    expect(
      createBlockRanges({
        batchStart: 100000,
        batchIndex: 0,
        batchSize: 10,
        blockDenom: 9000,
        batchDigest: 2,
        currentBlockNumber: 118000,
        type: 'deposit'
      })
    ).toEqual([
      { fromBlock: 100000, toBlock: 108999, type: 'deposit' },
      { fromBlock: 109000, toBlock: 118000, type: 'deposit' }
    ])
  })

  it('prefers the persisted sync cursor over the last event block', () => {
    expect(getPersistedEventCursor({ blockNumber: 123456 }, [{ blockNumber: 120000 }])).toBe(123456)
  })

  it('starts RPC synchronization after the latest block covered by Graph', () => {
    expect(getNextSyncBlock(120000, { blockNumber: 119900 })).toBe(120001)
    expect(getNextSyncBlock(120000, { blockNumber: 120010 })).toBe(120011)
    expect(getNextSyncBlock(undefined)).toBe('')
  })

  it('does not persist an event cursor beyond the current chain head', () => {
    expect(clampEventCursor(101, 100)).toBe(100)
    expect(clampEventCursor(99, 100)).toBe(99)
  })

  it('finishes Graph pagination only when a page is smaller than the requested size', () => {
    const events = Array.from({ length: 999 }, (_, index) => ({ blockNumber: index + 1 }))

    expect(splitGraphPage(events, 0)).toEqual({ events, isComplete: true, nextBlock: null })
  })

  it('keeps the boundary block for the next Graph page', () => {
    const events = [
      ...Array.from({ length: 999 }, (_, index) => ({ blockNumber: index + 1 })),
      { blockNumber: 999 }
    ]
    const page = splitGraphPage(events, 0)

    expect(page.events).toHaveLength(998)
    expect(page.isComplete).toBe(false)
    expect(page.nextBlock).toBe(999)
  })

  it('rejects a full Graph page that cannot advance beyond its current block', () => {
    const events = Array.from({ length: 1000 }, () => ({ blockNumber: 100 }))

    expect(() => splitGraphPage(events, 100)).toThrow('Graph pagination did not advance')
  })

  it('merges Graph, RPC and persisted events without duplicating their boundary event', () => {
    const boundary = {
      transactionHash: '0xtx',
      commitment: '0xcommitment',
      leafIndex: 2,
      blockNumber: 20
    }

    expect(
      mergeEventStreams(
        [{ ...boundary, source: 'persisted' }],
        [{ ...boundary, source: 'graph' }],
        [{ transactionHash: '0xnext', commitment: '0xnext', leafIndex: 3, blockNumber: 21 }]
      )
    ).toEqual([
      { ...boundary, source: 'persisted' },
      { transactionHash: '0xnext', commitment: '0xnext', leafIndex: 3, blockNumber: 21 }
    ])
  })
})
