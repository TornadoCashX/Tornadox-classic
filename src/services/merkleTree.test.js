jest.mock('@/services/runtimeAssets', () => ({ download: jest.fn() }))
jest.mock('@/services/runtimeStorage', () => ({
  getRuntimeIndexedDB: jest.fn(() => ({ getAll: jest.fn() }))
}))
jest.mock('@/services/bloom', () => ({
  bloomService: jest.fn(() => ({ checkBloom: jest.fn() }))
}))

const { TreesFactory } = require('./merkleTree')

describe('Merkle tree service boundary', () => {
  it('caches one pool service without retaining the first withdrawal commitment', async () => {
    const factory = new TreesFactory()
    const first = factory.getService({
      netId: 1,
      currency: 'eth',
      amount: '0.1',
      commitment: 'first',
      instanceName: '1_eth_0.1'
    })
    const second = factory.getService({
      netId: 1,
      currency: 'eth',
      amount: '0.1',
      commitment: 'second',
      instanceName: '1_eth_0.1'
    })
    first.getTreeFromDB = jest.fn((commitment) => Promise.resolve(commitment))

    expect(second).toBe(first)
    await expect(second.getTree({ commitment: 'second' })).resolves.toBe('second')
    expect(first.getTreeFromDB).toHaveBeenCalledWith('second')
  })
})
