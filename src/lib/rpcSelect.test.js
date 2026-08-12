const mockResponses = new Map()
const mockLogResponses = new Map()
const mockLogRequests = []
const mockRequestedUrls = []
const delayed = (value, delayMs) => new Promise((resolve) => setTimeout(() => resolve(value), delayMs))

jest.mock('viem', () => {
  const actual = jest.requireActual('viem')
  return {
    ...actual,
    http: (url) => url,
    createPublicClient: ({ transport }) => {
      mockRequestedUrls.push(transport)
      return {
        getBlockNumber: () => Promise.resolve(1100n),
        getChainId: () => {
          const response = mockResponses.get(transport)
          return typeof response === 'function' ? response() : Promise.resolve(response)
        },
        getLogs: (request) => {
          mockLogRequests.push({ url: transport, request })
          const response = mockLogResponses.get(transport)
          return response instanceof Error ? Promise.reject(response) : Promise.resolve(response || [])
        }
      }
    }
  }
})

jest.mock('./networkHelpers', () => ({
  getNetworkConfig: () => ({
    deployedBlock: 100,
    tokens: {
      eth: { instanceAddress: { '0.1': '0x0000000000000000000000000000000000000001' } }
    },
    rpcUrls: {
      first: { name: 'First', url: 'https://first.example' },
      second: { name: 'Second', url: 'https://second.example' }
    }
  })
}))

describe('rpcSelect', () => {
  beforeEach(() => {
    jest.resetModules()
    window.localStorage.clear()
    mockResponses.clear()
    mockLogResponses.clear()
    mockLogRequests.length = 0
    mockRequestedUrls.length = 0
  })

  test('probes recent logs on all built-in RPCs and selects the fastest valid endpoint', async () => {
    mockResponses.set('https://first.example', () => delayed(1, 20))
    mockResponses.set('https://second.example', () => delayed(1, 1))

    const { ensureRpcSelected } = require('./rpcSelect')

    const selected = await ensureRpcSelected(1)
    expect(mockRequestedUrls.sort()).toEqual(['https://first.example', 'https://second.example'])
    expect(selected).toBe('https://second.example')
    expect(mockLogRequests[0].request).toEqual({
      address: '0x0000000000000000000000000000000000000001',
      fromBlock: 100n,
      toBlock: 100n
    })
  })

  test('ignores endpoints that report the wrong chain id', async () => {
    mockResponses.set('https://first.example', 1)
    mockResponses.set('https://second.example', 3)

    const { ensureRpcSelected } = require('./rpcSelect')

    const selected = await ensureRpcSelected(3)
    expect(mockRequestedUrls).toEqual(['https://first.example', 'https://second.example'])
    expect(selected).toBe('https://second.example')
  })

  test('ignores endpoints that cannot read recent logs', async () => {
    mockResponses.set('https://first.example', 3)
    mockResponses.set('https://second.example', 3)
    mockLogResponses.set('https://first.example', new Error('archive data unavailable'))

    const { ensureRpcSelected } = require('./rpcSelect')

    await expect(ensureRpcSelected(3)).resolves.toBe('https://second.example')
  })

  test('does not let an older health check overwrite an internal selection', async () => {
    let resolveFirst
    let resolveSecond
    mockResponses.set(
      'https://first.example',
      () => new Promise((resolve) => {
        resolveFirst = resolve
      })
    )
    mockResponses.set(
      'https://second.example',
      () => new Promise((resolve) => {
        resolveSecond = resolve
      })
    )

    const { ensureRpcSelected, getResolvedRpcUrl, setResolvedRpcUrl } = require('./rpcSelect')
    const selecting = ensureRpcSelected(2)
    await Promise.resolve()

    setResolvedRpcUrl(2, 'https://internal.example')
    resolveFirst(2)
    resolveSecond(2)

    await expect(selecting).resolves.toBe('https://internal.example')
    expect(getResolvedRpcUrl(2)).toBe('https://internal.example')
    expect(window.localStorage.getItem('tornado-rpc:2')).toBe(null)
  })

  test('rejects instead of returning a known failed endpoint', async () => {
    mockResponses.set('https://first.example', () => Promise.reject(new Error('down')))
    mockResponses.set('https://second.example', () => Promise.reject(new Error('down')))

    const { ensureRpcSelected, NoHealthyRpcError } = require('./rpcSelect')

    await expect(ensureRpcSelected(4)).rejects.toBeInstanceOf(NoHealthyRpcError)
  })

  test('reselects after a selected endpoint fails during actual use', async () => {
    mockResponses.set('https://first.example', () => delayed(5, 1))
    mockResponses.set('https://second.example', () => delayed(5, 20))

    const { ensureRpcSelected, reselectRpc } = require('./rpcSelect')
    await expect(ensureRpcSelected(5)).resolves.toBe('https://first.example')
    await expect(reselectRpc(5, ['https://first.example'])).resolves.toBe('https://second.example')
  })

  test('retries a read with a newly selected endpoint', async () => {
    mockResponses.set('https://first.example', 6)
    mockResponses.set('https://second.example', 6)
    const read = jest.fn((url) =>
      url === 'https://first.example' ? Promise.reject(new Error('read failed')) : Promise.resolve('ok')
    )

    const { withRpcReadRetry } = require('./rpcSelect')

    await expect(withRpcReadRetry(6, read)).resolves.toBe('ok')
    expect(read.mock.calls.map(([url]) => url)).toEqual(['https://first.example', 'https://second.example'])
  })

  test('can recover on a later call after every endpoint was unavailable', async () => {
    mockResponses.set('https://first.example', () => Promise.reject(new Error('down')))
    mockResponses.set('https://second.example', () => Promise.reject(new Error('down')))
    const { ensureRpcSelected } = require('./rpcSelect')

    await expect(ensureRpcSelected(7)).rejects.toThrow('No healthy RPC endpoint')
    mockResponses.set('https://first.example', 7)
    await expect(ensureRpcSelected(7)).resolves.toBe('https://first.example')
  })

  test('ignores a user-saved RPC from the old settings modal', async () => {
    window.localStorage.setItem('tornado-rpc:8', 'https://custom.example')
    mockResponses.set('https://first.example', 8)
    mockResponses.set('https://second.example', 8)

    const { ensureRpcSelected } = require('./rpcSelect')

    await expect(ensureRpcSelected(8)).resolves.toMatch(/^https:\/\/(first|second)\.example$/)
    expect(mockRequestedUrls).not.toContain('https://custom.example')
  })
})
