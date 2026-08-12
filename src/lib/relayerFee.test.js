jest.mock('@/services/feeCalculator', () => ({ createFeeOracle: jest.fn() }))
jest.mock('./networkHelpers', () => ({
  getCurrentRpcUrl: jest.fn(() => 'https://rpc.example'),
  getNetworkConfig: jest.fn(() => ({
    nativeCurrency: 'eth',
    gasPrices: { fast: 1 },
    tokens: {
      eth: { symbol: 'ETH', decimals: 18 },
      dai: { symbol: 'DAI', decimals: 18 }
    }
  }))
}))
jest.mock('./contracts', () => ({
  getInstanceAddress: jest.fn(() => '0x2222222222222222222222222222222222222222'),
  getTornadoProxyAddress: jest.fn(() => '0x1111111111111111111111111111111111111111')
}))
jest.mock('./rpcSelect', () => ({
  ensureRpcSelected: jest.fn().mockResolvedValue('https://rpc.example')
}))

const { createFeeOracle } = require('@/services/feeCalculator')
const { calculateRelayerFee, calculateRelayerRefund } = require('./relayerFee')

describe('relayer token fees', () => {
  const calculateRefundInETH = jest.fn().mockResolvedValue('0x20')
  const calculateWithdrawalFeeViaRelayer = jest.fn().mockResolvedValue('0x10')

  beforeEach(() => {
    jest.clearAllMocks()
    createFeeOracle.mockReturnValue({ calculateRefundInETH, calculateWithdrawalFeeViaRelayer })
  })

  it('does not calculate a refund for the native currency', async () => {
    await expect(calculateRelayerRefund(1, 'eth')).resolves.toBe('0')
    expect(createFeeOracle).not.toHaveBeenCalled()
  })

  it('calculates an ERC20 refund through the configured fee oracle', async () => {
    await expect(calculateRelayerRefund(1, 'dai')).resolves.toBe('32')
    expect(calculateRefundInETH).toHaveBeenCalledWith('dai')
  })

  it('normalizes a 0x10 oracle fee to decimal 16', async () => {
    await expect(
      calculateRelayerFee({
        netId: 1,
        currency: 'dai',
        amount: '100',
        feePercent: 0.3,
        refundInEth: '0x20',
        tokenPriceInEth: '500'
      })
    ).resolves.toBe('16')

    expect(calculateWithdrawalFeeViaRelayer).toHaveBeenCalledWith(
      'user_withdrawal',
      undefined,
      0.3,
      'dai',
      '100',
      18,
      '0x20',
      '500'
    )
  })

  it('rejects a token withdrawal when the relayer omitted its price', async () => {
    await expect(
      calculateRelayerFee({ netId: 1, currency: 'dai', amount: '100', feePercent: 0.3 })
    ).rejects.toThrow('Relayer did not provide a DAI price')
    expect(createFeeOracle).not.toHaveBeenCalled()
  })
})
