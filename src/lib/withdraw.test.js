const mockWithEventReadRetry = jest.fn()
const mockGetTree = jest.fn()
const mockCreateTree = jest.fn()
const mockSaveTree = jest.fn()
const mockSyncEvents = jest.fn()
const mockCheckCommitments = jest.fn()
const mockToFixedHex = jest.fn()
const mockIsKnownRoot = jest.fn()

jest.mock('@/lib/eventReads', () => ({
  withEventReadRetry: (...args) => mockWithEventReadRetry(...args)
}))

jest.mock('@/services/merkleTree', () => ({
  treesInterface: {
    getService: () => ({
      getTree: mockGetTree,
      createTree: mockCreateTree,
      saveTree: mockSaveTree
    })
  }
}))

jest.mock('@/services/eventLoader', () => ({
  syncEvents: (...args) => mockSyncEvents(...args)
}))

jest.mock('@/utils', () => ({
  checkCommitments: (...args) => mockCheckCommitments(...args),
  toFixedHex: (...args) => mockToFixedHex(...args)
}))

jest.mock('./contracts', () => ({
  isKnownRoot: (...args) => mockIsKnownRoot(...args)
}))

const { buildTree } = require('./withdraw')

describe('withdraw tree builder', () => {
  const findEvent = jest.fn()
  const eventsInterface = {
    getService: jest.fn(() => ({ findEvent }))
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockWithEventReadRetry.mockImplementation((_netId, read) => read(eventsInterface))
    mockGetTree.mockResolvedValue(undefined)
    mockCreateTree.mockReturnValue({ root: 1n })
    mockSaveTree.mockResolvedValue(undefined)
    mockToFixedHex.mockReturnValue('0xroot')
    mockIsKnownRoot.mockResolvedValue(true)
    mockCheckCommitments.mockImplementation((events, errorMessage) => {
      events.forEach((event, index) => {
        if (event.leafIndex !== index) throw new Error(errorMessage)
      })
    })
  })

  it('adds the exact deposit event when the synced event set missed the current commitment', async () => {
    mockSyncEvents.mockResolvedValue({
      events: [
        { commitment: '0xaaa', leafIndex: 0, transactionHash: '0xtx0', blockNumber: 1, timestamp: 1 },
        { commitment: '0xbbb', leafIndex: 1, transactionHash: '0xtx1', blockNumber: 2, timestamp: 2 }
      ],
      lastBlock: 2
    })
    findEvent.mockResolvedValue({
      commitment: '0xccc',
      leafIndex: 2,
      transactionHash: '0xtx2',
      blockNumber: 3,
      timestamp: 3
    })

    await expect(
      buildTree({
        netId: 11155111,
        currency: 'eth',
        amount: '0.1',
        commitmentHex: '0xccc',
        missingEventsMessage: 'missing events'
      })
    ).resolves.toEqual({ tree: { root: 1n }, root: '0xroot' })

    expect(findEvent).toHaveBeenCalledWith({
      eventName: 'commitment',
      eventToFind: '0xccc',
      type: 'deposit'
    })
    expect(mockCheckCommitments).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ commitment: '0xccc', leafIndex: 2 })]),
      'missing events'
    )
    expect(mockCreateTree).toHaveBeenCalledWith({ events: ['0xaaa', '0xbbb', '0xccc'] })
  })
})
