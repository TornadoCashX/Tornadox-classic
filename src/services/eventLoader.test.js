jest.mock('@/services/runtimeAssets', () => ({
  download: jest.fn()
}))

const { getCurrentEventSyncParams, loadEncryptedEventsBundle, syncEvents } = require('./eventLoader')
const { download } = require('@/services/runtimeAssets')

describe('event loader service', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('delegates event syncing to the event service selected by payload', () => {
    const updateEvents = jest.fn(() => Promise.resolve())
    const eventsInterface = {
      getService: jest.fn(() => ({ updateEvents }))
    }
    const payload = { type: 'deposit', netId: 1, currency: 'eth', amount: '0.1' }

    syncEvents({ eventsInterface, payload })

    expect(eventsInterface.getService).toHaveBeenCalledWith(payload)
    expect(updateEvents).toHaveBeenCalledWith('deposit')
  })

  it('starts current event sync after the last known event block', async () => {
    await expect(
      getCurrentEventSyncParams({
        currency: 'dai',
        amount: '100',
        lastEvent: { blockNumber: 123 },
        type: 'withdrawal',
        netId: 1,
        nativeCurrency: 'eth',
        idb: {}
      })
    ).resolves.toMatchObject({
      type: 'withdrawal',
      netId: 1,
      amount: '100',
      currency: 'dai',
      fromBlock: 124
    })
  })

  it('uses the native-currency cursor from IndexedDB before falling back to deployedBlock', async () => {
    const idb = {
      getFromIndex: jest.fn().mockResolvedValue({ blockNumber: 456 })
    }

    await expect(
      getCurrentEventSyncParams({
        currency: 'eth',
        amount: '0.1',
        lastEvent: null,
        type: 'deposit',
        netId: 1,
        nativeCurrency: 'eth',
        idb
      })
    ).resolves.toMatchObject({ fromBlock: 457 })
    expect(idb.getFromIndex).toHaveBeenCalledWith({
      indexName: 'name',
      storeName: 'lastEvents',
      key: 'deposits_1_eth_0.1'
    })
  })

  it('loads encrypted-note event bundles from static cache files', async () => {
    download.mockResolvedValue(JSON.stringify([{ blockNumber: 10 }, { blockNumber: 20 }]))

    await expect(loadEncryptedEventsBundle({ netId: 1 })).resolves.toEqual({
      events: [{ blockNumber: 10 }, { blockNumber: 20 }],
      lastBlock: 20
    })
    expect(download).toHaveBeenCalledWith({ name: 'events/encrypted_notes_1.json.gz' })
  })

  it('accepts an empty encrypted-note cache bundle', async () => {
    download.mockResolvedValue('[]')

    await expect(loadEncryptedEventsBundle({ netId: 1 })).resolves.toEqual({
      events: [],
      lastBlock: ''
    })
  })
})
