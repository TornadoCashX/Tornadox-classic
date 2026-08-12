jest.mock('@/services/runtimeAssets', () => ({
  getTornadoKeys: jest.fn()
}))
jest.mock('@/services/legacyProofRuntime', () => ({
  legacyProofRuntime: { prove: jest.fn() }
}))

const { createWithdrawalProofGenerator } = require('./proof')

describe('proof runtime boundary', () => {
  it('delegates proof generation to the isolated legacy runtime', async () => {
    const loadKeys = jest.fn().mockResolvedValue({ circuit: 'circuit', provingKey: 'key' })
    const proofRuntime = { prove: jest.fn().mockResolvedValue('0xproof') }
    const generate = createWithdrawalProofGenerator({ loadKeys, proofRuntime })
    const input = {
      root: '1',
      nullifierHash: '2',
      recipient: '3',
      relayer: '4',
      fee: '5',
      refund: '6'
    }

    await expect(generate(input)).resolves.toMatchObject({ proof: '0xproof' })
    expect(proofRuntime.prove).toHaveBeenCalledWith(input, { circuit: 'circuit', provingKey: 'key' })
  })
})
