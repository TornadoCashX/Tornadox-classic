const mockFactoryUrls = []

jest.mock('@/services/events', () => ({
  getEventsFactory: (url) => {
    mockFactoryUrls.push(url)
    return { url }
  }
}))

jest.mock('./rpcSelect', () => ({
  withRpcReadRetry: async (_netId, read) => {
    try {
      return await read('https://first.example')
    } catch {
      return read('https://second.example')
    }
  }
}))

const { withEventReadRetry } = require('./eventReads')

describe('event RPC read retry', () => {
  beforeEach(() => {
    mockFactoryUrls.length = 0
  })

  test('recreates the event factory for the retry endpoint', async () => {
    const read = jest.fn((eventsInterface) =>
      eventsInterface.url === 'https://first.example'
        ? Promise.reject(new Error('read failed'))
        : Promise.resolve('ok')
    )

    await expect(withEventReadRetry(1, read)).resolves.toBe('ok')
    expect(mockFactoryUrls).toEqual(['https://first.example', 'https://second.example'])
    expect(read).toHaveBeenCalledTimes(2)
  })
})
