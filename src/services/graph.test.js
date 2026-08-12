jest.mock('@/config/publicEnv', () => ({ getGraphApiKey: jest.fn(() => 'graph-key') }))

const graph = require('./graph').default

describe('Graph client', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('uses the configured endpoint and sends a standard GraphQL request', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ data: { deposits: [{ index: '1' }] } })
    })

    await expect(graph.getDeposits({ currency: 'eth', amount: '0.1', fromBlock: 10, netId: 1 })).resolves.toEqual([
      { index: '1' }
    ])

    const [url, request] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/graph-key/subgraphs/')
    expect(request).toMatchObject({ method: 'POST', credentials: 'omit' })
    expect(JSON.parse(request.body)).toMatchObject({
      variables: { currency: 'eth', amount: '0.1', fromBlock: 10, first: 1000 }
    })
  })

  it('rejects an unsuccessful Graph response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 })
    await expect(graph.getDeposits({ currency: 'eth', amount: '0.1', fromBlock: 0, netId: 1 })).rejects.toThrow(
      'Graph request failed with status 503'
    )
  })
})
