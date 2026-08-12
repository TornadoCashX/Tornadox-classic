const mockGetConfiguredRelayer = jest.fn()
const mockFetchRelayerStatus = jest.fn()
const mockValidateRelayerStatus = jest.fn()

jest.mock('axios', () => ({}))
jest.mock('@/config/publicEnv', () => ({
  getRelayerConfig: () => ({ getConfiguredRelayer: mockGetConfiguredRelayer })
}))
jest.mock('@/services/relayerClient', () => ({
  fetchRelayerStatus: (...args) => mockFetchRelayerStatus(...args),
  validateRelayerStatus: (...args) => mockValidateRelayerStatus(...args),
  buildRelayerSelection: ({ name, realUrl, status }) => ({
    isValid: true,
    name,
    url: realUrl,
    address: status.rewardAccount,
    tornadoServiceFee: status.tornadoServiceFee,
    ethPrices: status.ethPrices
  })
}))

const { setupDefaultRelayer } = require('./relayerSetup')

describe('built-in relayer setup', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetConfiguredRelayer.mockReturnValue({ name: 'Official', url: 'https://relayer.example/base/' })
    mockFetchRelayerStatus.mockResolvedValue({
      url: 'https://relayer.example/base/',
      status: { rewardAccount: '0xabc', tornadoServiceFee: 0.3, ethPrices: { eth: '1' } }
    })
    mockValidateRelayerStatus.mockReturnValue({ isValid: true })
  })

  it('loads the configured HTTPS relayer without custom discovery', async () => {
    await expect(setupDefaultRelayer(1)).resolves.toMatchObject({
      name: 'Official',
      url: 'https://relayer.example/base/',
      address: '0xabc'
    })
    expect(mockFetchRelayerStatus).toHaveBeenCalledWith(expect.objectContaining({
      relayerUrl: 'https://relayer.example/base/'
    }))
  })

  it.each(['http://relayer.example', 'https://user:pass@relayer.example', 'https://relayer.example/?custom=1'])(
    'rejects non-built-in URL shape %s',
    async (url) => {
      mockGetConfiguredRelayer.mockReturnValue({ name: 'Official', url })
      await expect(setupDefaultRelayer(1)).resolves.toBeNull()
      expect(mockFetchRelayerStatus).not.toHaveBeenCalled()
    }
  )

  it('disables withdrawal when the configured relayer fails validation', async () => {
    mockValidateRelayerStatus.mockReturnValue({ isValid: false, error: 'wrong network' })
    await expect(setupDefaultRelayer(1)).resolves.toBeNull()
  })
})
