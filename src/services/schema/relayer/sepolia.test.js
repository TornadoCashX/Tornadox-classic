import schema from '@/services/schema'

const address = '0x1111111111111111111111111111111111111111'

const createStatus = () => ({
  rewardAccount: address,
  instances: {
    eth: {
      instanceAddress: {
        '0.1': address,
        '1': address,
        '10': address,
        '100': address
      },
      decimals: 18
    },
    dai: {
      instanceAddress: {
        '100': address,
        '1000': address,
        '10000': address,
        '100000': address
      },
      tokenAddress: address,
      symbol: 'DAI',
      decimals: 18
    }
  },
  netId: 11155111,
  ethPrices: {
    dai: '547055275911899'
  },
  tornadoServiceFee: 0.36,
  miningServiceFee: 0.05,
  version: '5.2.1',
  health: {
    status: 'true',
    error: '',
    errorsLog: []
  },
  currentQueue: 0
})

describe('Sepolia relayer status schema', () => {
  const validate = schema.getRelayerValidateFunction(11155111)

  it('accepts a configured ETH and DAI relayer with only the DAI price', () => {
    expect(validate(createStatus())).toBe(true)
  })

  it('rejects a status without the configured DAI price', () => {
    const status = createStatus()
    delete status.ethPrices.dai

    expect(validate(status)).toBe(false)
  })
})
