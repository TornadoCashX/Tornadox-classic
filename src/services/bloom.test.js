jest.mock('@/services/runtimeAssets', () => ({ download: jest.fn() }))
jest.mock('@/services/runtimeStorage', () => ({
  getRuntimeIndexedDB: jest.fn(() => ({ getAll: jest.fn().mockResolvedValue([]) }))
}))

const { BloomService } = require('./bloom')

describe('Bloom cache service', () => {
  it('treats an unavailable Bloom cache as a cache miss', async () => {
    const service = new BloomService({
      netId: 1,
      amount: '0.1',
      instanceName: '1_eth_0.1',
      fileFolder: 'trees',
      fileName: 'bloom.json.gz'
    })
    service.getBloomFromCache = jest.fn().mockResolvedValue(false)

    await expect(service.checkBloom('commitment')).resolves.toBe(false)
  })
})
