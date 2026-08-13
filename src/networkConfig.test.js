const { isAddress } = require('viem')
const networkConfigModule = require('./networkConfig')

const networkConfig = networkConfigModule.default || networkConfigModule
const { defaultEnabledChains, enabledChains, parseEnabledChains } = networkConfigModule

describe('networkConfig', () => {
  it('parses the enabled chain env allowlist safely', () => {
    expect(parseEnabledChains('1,56,56,999')).toEqual(['1', '56'])
    expect(parseEnabledChains('all')).toEqual(defaultEnabledChains)
    expect(parseEnabledChains('999')).toEqual(defaultEnabledChains)
  })

  it('has one complete config entry for every enabled chain', () => {
    expect(enabledChains.length).toBeGreaterThan(0)

    for (const chainId of enabledChains) {
      const config = networkConfig[`netId${chainId}`]
      expect(config).toBeTruthy()
      expect(config.networkName).toEqual(expect.any(String))
      expect(config.nativeCurrency).toEqual(expect.any(String))
      expect(config.deployedBlock).toEqual(expect.any(Number))
      expect(config.merkleTreeHeight).toEqual(expect.any(Number))
      expect(config.emptyElement).toBeTruthy()
      expect(config.rpcUrls && Object.keys(config.rpcUrls).length).toBeGreaterThan(0)
      expect(isAddress(config.multicall)).toBe(true)
      expect(isAddress(config.echoContractAccount)).toBe(true)
      expect(config.explorerUrl).toEqual(
        expect.objectContaining({
          tx: expect.stringMatching(/^https?:\/\//),
          address: expect.stringMatching(/^https?:\/\//),
          block: expect.stringMatching(/^https?:\/\//)
        })
      )
    }
  })

  it('defines valid token pools and token metadata', () => {
    for (const chainId of enabledChains) {
      const config = networkConfig[`netId${chainId}`]

      for (const [currency, token] of Object.entries(config.tokens)) {
        expect(token.symbol).toEqual(expect.any(String))
        expect(token.decimals).toEqual(expect.any(Number))
        expect(token.instanceAddress && Object.keys(token.instanceAddress).length).toBeGreaterThan(0)

        if (currency !== config.nativeCurrency) {
          expect(isAddress(token.tokenAddress)).toBe(true)
        }

        for (const [amount, instanceAddress] of Object.entries(token.instanceAddress)) {
          expect(Number.isFinite(Number(amount))).toBe(true)
          expect(isAddress(instanceAddress)).toBe(true)
        }
      }
    }
  })
})
