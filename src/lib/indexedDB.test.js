const mockOpenDB = jest.fn()
const mockDeleteDB = jest.fn()

jest.mock('idb', () => ({
  openDB: (...args) => mockOpenDB(...args),
  deleteDB: (...args) => mockDeleteDB(...args)
}))

const { IndexedDB } = require('./indexedDB')

describe('IndexedDB optional cache', () => {
  let consoleError

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  test('reports a usable cache after initialization', async () => {
    mockOpenDB.mockResolvedValue({})
    const cache = new IndexedDB({ dbName: 'test', stores: [] })

    await expect(cache.initDB()).resolves.toBe(true)
    expect(cache.dbExists).toBe(true)
    expect(cache.isBlocked).toBe(false)
  })

  test('degrades to an empty cache without rejecting business flows', async () => {
    mockOpenDB.mockRejectedValue(new Error('storage denied'))
    const cache = new IndexedDB({ dbName: 'test', stores: [] })

    await expect(cache.initDB()).resolves.toBe(false)
    expect(cache.isBlocked).toBe(true)
    await expect(cache.getAll({ storeName: 'events' })).resolves.toEqual([])
    expect(consoleError).toHaveBeenCalledWith('Method initDB has error: storage denied')
  })
})
