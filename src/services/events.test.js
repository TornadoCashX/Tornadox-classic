const mockGetLogs = jest.fn()
const mockGetBlockNumber = jest.fn()
const mockGetAbiItem = jest.fn(({ name }) => ({ type: 'event', name }))

jest.mock('viem', () => {
  const actual = jest.requireActual('viem')
  return {
    ...actual,
    http: (url) => url,
    getAbiItem: (...args) => mockGetAbiItem(...args),
    createPublicClient: () => ({
      getLogs: mockGetLogs,
      getBlockNumber: mockGetBlockNumber
    })
  }
})

jest.mock('@/services/graph', () => ({
  __esModule: true,
  default: {}
}))
jest.mock('@/services/runtimeAssets', () => ({ download: jest.fn() }))
jest.mock('@/services/runtimeStorage', () => ({
  getRuntimeIndexedDB: jest.fn(() => ({
    isBlocked: true,
    getAll: jest.fn().mockResolvedValue([]),
    getFromIndex: jest.fn().mockResolvedValue(undefined),
    putItem: jest.fn(),
    createMultipleTransactions: jest.fn()
  }))
}))
jest.mock('@/services/runtimeProgress', () => ({ reportEventProgress: jest.fn() }))

const { download } = require('./runtimeAssets')
const { EventService, EventsFactory } = require('./events')

const createService = () =>
  new EventService({
    netId: 1,
    currency: 'eth',
    amount: '0.1',
    factoryMethods: {
      getContract: jest.fn(() => ({})),
      getBlockNumber: jest.fn().mockResolvedValue(100)
    }
  })

const createServiceWithFactory = (factoryMethods) =>
  new EventService({
    netId: 1,
    currency: 'eth',
    amount: '0.1',
    factoryMethods
  })

describe('event service handoff', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('uses viem event ABI items when reading logs', async () => {
    mockGetLogs.mockResolvedValue([
      {
        blockNumber: 1n,
        transactionHash: '0xtx',
        args: {
          commitment: '0xcommitment',
          leafIndex: 0n,
          timestamp: 1n
        }
      }
    ])
    const factory = new EventsFactory('https://rpc.example')

    await expect(
      factory.getPastEvents('0x8C4A04d872a6C1BE37964A21ba3a138525dFF50b', 'Deposit', {
        filter: { commitment: '0xcommitment' },
        fromBlock: 1,
        toBlock: 2
      })
    ).resolves.toEqual([
      {
        blockNumber: 1,
        transactionHash: '0xtx',
        args: {
          commitment: '0xcommitment',
          leafIndex: '0',
          timestamp: '1'
        }
      }
    ])
    expect(mockGetAbiItem).toHaveBeenCalledWith({ abi: expect.any(Array), name: 'Deposit' })
    expect(mockGetLogs).toHaveBeenCalledWith({
      address: '0x8C4A04d872a6C1BE37964A21ba3a138525dFF50b',
      event: { type: 'event', name: 'Deposit' },
      args: { commitment: '0xcommitment' },
      fromBlock: 1n,
      toBlock: 2n
    })
  })

  it('accepts an empty static event cache', async () => {
    download.mockResolvedValue('[]')
    await expect(createService().getEventsFromCache('deposit')).resolves.toEqual({
      events: [],
      lastBlock: ''
    })
  })

  it('uses the static event cache when IndexedDB is unavailable', async () => {
    const cached = [{ commitment: '0xcached', blockNumber: 10, leafIndex: 0 }]
    download.mockResolvedValue(JSON.stringify(cached))

    await expect(createService().getEvents('deposit')).resolves.toEqual({
      events: cached,
      lastBlock: 10
    })
  })

  it('uses static event bundles for token pools', async () => {
    const service = new EventService({
      netId: 1,
      currency: 'dai',
      amount: '10000',
      factoryMethods: { getBlockNumber: jest.fn().mockResolvedValue(100) }
    })
    const cached = [{ commitment: '0xtoken', blockNumber: 10, leafIndex: 0 }]
    download.mockResolvedValue(JSON.stringify(cached))

    await expect(service.getEvents('deposit')).resolves.toEqual({ events: cached, lastBlock: 10 })
    expect(download).toHaveBeenCalledWith({ name: 'events/deposits_1_dai_10000.json.gz' })
  })

  it('uses the static event cache when IndexedDB only has a cursor', async () => {
    const service = createService()
    const cached = [{ commitment: '0xcached', blockNumber: 10, leafIndex: 0 }]
    service.idb.getAll = jest.fn().mockResolvedValue([])
    service.idb.getFromIndex = jest.fn().mockResolvedValue({ name: 'deposits_1_eth_0.1', blockNumber: 99 })
    download.mockResolvedValue(JSON.stringify(cached))

    await expect(service.getEvents('deposit')).resolves.toEqual({
      events: cached,
      lastBlock: 10
    })
  })

  it('uses the static event cache when IndexedDB deposit rows are not contiguous from zero', async () => {
    const service = createService()
    const cached = [{ commitment: '0xcached', transactionHash: '0xcachedtx', blockNumber: 10, leafIndex: 0, timestamp: 1 }]
    service.idb.getAll = jest.fn().mockResolvedValue([
      {
        commitment: '0xpartial',
        transactionHash: '0xpartialtx',
        blockNumber: 99,
        leafIndex: 5,
        timestamp: 2
      }
    ])
    service.idb.getFromIndex = jest.fn().mockResolvedValue({ name: 'deposits_1_eth_0.1', blockNumber: 99 })
    download.mockResolvedValue(JSON.stringify(cached))

    await expect(service.getEvents('deposit')).resolves.toEqual({
      events: cached,
      lastBlock: 10
    })
  })

  it('keeps indexed Graph events when the live RPC continuation is temporarily unavailable', async () => {
    const service = createService()
    const graphResult = {
      events: [{ commitment: '0xcommitment', blockNumber: 90, leafIndex: 1 }],
      lastBlock: 91
    }
    service.getEventsFromGraph = jest.fn().mockResolvedValue(graphResult)
    service.getEventsFromRpc = jest.fn().mockResolvedValue(undefined)

    await expect(
      service.getEventsFromBlock({ fromBlock: 1, graphMethod: 'getAllDeposits', type: 'deposit' })
    ).resolves.toEqual(graphResult)
  })

  it('does not turn complete Graph and RPC failure into an empty successful sync', async () => {
    const service = createService()
    service.getEvents = jest.fn().mockResolvedValue(undefined)
    service.getEventsFromBlock = jest.fn().mockResolvedValue(undefined)

    await expect(service.updateEvents('deposit')).rejects.toThrow('rpcIsDown')
  })

  it('returns only normalized events after updateEvents', async () => {
    const service = createService()
    service.getEvents = jest.fn().mockResolvedValue({
      events: [{ blockNumber: 1, transactionHash: '0xbad', commitment: '0xbad' }],
      lastBlock: 1
    })
    service.getEventsFromBlock = jest.fn().mockResolvedValue({
      events: [
        {
          blockNumber: 2n,
          transactionHash: '0xgood',
          args: {
            commitment: '0xcommitment',
            leafIndex: 4n,
            timestamp: 123n
          }
        }
      ],
      lastBlock: 2
    })
    service.saveEvents = jest.fn().mockResolvedValue(undefined)

    await expect(service.updateEvents('deposit')).resolves.toEqual({
      events: [
        {
          blockNumber: 2,
          transactionHash: '0xgood',
          commitment: '0xcommitment',
          leafIndex: 4,
          timestamp: 123
        }
      ],
      lastBlock: 2
    })
  })

  it('falls back to an exact commitment scan when local cursors missed a deposit', async () => {
    const getPastEvents = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          blockNumber: 9120000n,
          transactionHash: '0xdeposit',
          args: {
            commitment: '0xcommitment',
            leafIndex: 7n,
            timestamp: 1234n
          }
        }
      ])
    const service = createServiceWithFactory({
      getBlockNumber: jest.fn().mockResolvedValue(9136966),
      getPastEvents
    })
    service.idb.getFromIndex = jest.fn().mockResolvedValue(undefined)
    service.getEvents = jest.fn().mockResolvedValue({
      events: [],
      lastBlock: 9116966
    })
    service.updateEvents = jest.fn().mockResolvedValue({
      events: [],
      lastBlock: 9116966
    })

    await expect(
      service.findEvent({ eventName: 'commitment', eventToFind: '0xcommitment', type: 'deposit' })
    ).resolves.toEqual({
      blockNumber: 9120000,
      transactionHash: '0xdeposit',
      commitment: '0xcommitment',
      leafIndex: 7,
      timestamp: 1234
    })
    expect(getPastEvents).toHaveBeenCalledWith(expect.any(String), 'Deposit', {
      filter: { commitment: '0xcommitment' },
      fromBlock: 9126967,
      toBlock: 9136966
    })
    expect(getPastEvents).toHaveBeenCalledWith(expect.any(String), 'Deposit', {
      filter: { commitment: '0xcommitment' },
      fromBlock: 9116967,
      toBlock: 9126966
    })
  })

  it('does not rescan blocks already covered by the static event cursor', async () => {
    const getPastEvents = jest.fn().mockResolvedValue([])
    const service = createServiceWithFactory({
      getBlockNumber: jest.fn().mockResolvedValue(9136966),
      getPastEvents
    })
    service.idb.getFromIndex = jest.fn().mockResolvedValue(undefined)
    service.getEvents = jest.fn().mockResolvedValue({ events: [], lastBlock: 9136000 })
    service.updateEvents = jest.fn().mockResolvedValue({ events: [], lastBlock: 9136966 })

    await expect(
      service.findEvent({ eventName: 'commitment', eventToFind: '0xmissing', type: 'deposit' })
    ).resolves.toBeUndefined()
    expect(getPastEvents).toHaveBeenCalledTimes(1)
    expect(getPastEvents).toHaveBeenCalledWith(expect.any(String), 'Deposit', {
      filter: { commitment: '0xmissing' },
      fromBlock: 9136001,
      toBlock: 9136966
    })
    expect(service.updateEvents).not.toHaveBeenCalled()
  })

  it('uses the newer static cursor when IndexedDB is stale', async () => {
    const getPastEvents = jest.fn().mockResolvedValue([])
    const service = createServiceWithFactory({
      getBlockNumber: jest.fn().mockResolvedValue(9136966),
      getPastEvents
    })
    service.idb.getFromIndex = jest.fn().mockResolvedValue(undefined)
    service.getEvents = jest.fn().mockResolvedValue({ events: [], lastBlock: 9116966 })
    service.getEventsFromCache = jest.fn().mockResolvedValue({ events: [], lastBlock: 9136000 })
    service.updateEvents = jest.fn().mockResolvedValue({ events: [], lastBlock: 9136966 })

    await expect(
      service.findEvent({ eventName: 'commitment', eventToFind: '0xmissing', type: 'deposit' })
    ).resolves.toBeUndefined()
    expect(getPastEvents).toHaveBeenCalledTimes(1)
    expect(getPastEvents).toHaveBeenCalledWith(expect.any(String), 'Deposit', {
      filter: { commitment: '0xmissing' },
      fromBlock: 9136001,
      toBlock: 9136966
    })
    expect(service.updateEvents).not.toHaveBeenCalled()
  })

  it('checks the static cache before exact RPC scanning for a missing deposit commitment', async () => {
    const getPastEvents = jest.fn()
    const service = createServiceWithFactory({
      getBlockNumber: jest.fn().mockResolvedValue(9136966),
      getPastEvents
    })
    service.idb.getFromIndex = jest.fn().mockResolvedValue(undefined)
    service.getEvents = jest.fn().mockResolvedValue({
      events: [],
      lastBlock: 9116966
    })
    download.mockResolvedValue(
      JSON.stringify([
        {
          blockNumber: 10,
          transactionHash: '0xcache',
          commitment: '0xcommitment',
          leafIndex: 0,
          timestamp: 1
        }
      ])
    )

    await expect(
      service.findEvent({ eventName: 'commitment', eventToFind: '0xcommitment', type: 'deposit' })
    ).resolves.toMatchObject({ transactionHash: '0xcache', commitment: '0xcommitment' })
    expect(getPastEvents).not.toHaveBeenCalled()
  })
})
