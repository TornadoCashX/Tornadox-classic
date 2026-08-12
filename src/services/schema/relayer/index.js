import { addressType } from '@/constants'

// JSON-schemas for a relayer's /status response, keyed by the names services/schema/index.js
// registers with Ajv and looks up via ajv.getSchema(...).
//
// Six of these (l2/bsc/xdai/etc/polygon/avalanche) used to be separate files that were
// byte-identical apart from the native-currency key and its instance denominations, so they are
// generated from one factory here instead. Mainnet ("default") is genuinely different - it also
// carries the ERC20 pools, gasPrices and ethPrices - and Sepolia narrows mainnet's ethPrices to
// the single token its relayers actually quote.

const instanceAddressSchema = ({ declared, required }) => ({
  type: 'object',
  properties: Object.fromEntries(declared.map((amount) => [amount, addressType])),
  required
})

// A pool of the chain's own native currency: no tokenAddress/symbol, since there is no ERC20
// contract behind it.
const nativeInstanceSchema = ({ declared, required }) => ({
  type: 'object',
  properties: {
    instanceAddress: instanceAddressSchema({ declared, required }),
    decimals: { enum: [18] }
  },
  required: ['instanceAddress', 'decimals']
})

// `required` defaults to every declared denomination; pass it explicitly for the tokens whose
// relayers only have to serve a subset (usdt/usdc/wbtc).
const erc20InstanceSchema = ({ symbol, decimals, declared, required = declared }) => ({
  type: 'object',
  properties: {
    instanceAddress: instanceAddressSchema({ declared, required }),
    tokenAddress: addressType,
    symbol: { enum: [symbol] },
    decimals: { enum: [decimals] }
  },
  required: ['instanceAddress', 'tokenAddress', 'decimals']
})

const healthSchema = {
  type: 'object',
  properties: {
    status: { const: 'true' },
    error: { type: 'string' }
  },
  required: ['status']
}

// Every non-mainnet relayer: one native-currency pool, no token prices, no gas prices.
const nativeCurrencyStatusSchema = ({ currency, declared, required = declared }) => ({
  type: 'object',
  properties: {
    rewardAccount: addressType,
    instances: {
      type: 'object',
      properties: {
        [currency]: nativeInstanceSchema({ declared, required })
      },
      required: [currency]
    },
    netId: { type: 'integer' },
    tornadoServiceFee: { type: 'number', maximum: 20, minimum: 0 },
    health: healthSchema,
    currentQueue: { type: 'number' }
  },
  required: ['rewardAccount', 'instances', 'netId', 'tornadoServiceFee', 'health']
})

const ETH_AMOUNTS = ['0.1', '1', '10', '100']
const STABLE_AMOUNTS = ['100', '1000', '10000', '100000']

const defaultRelayer = {
  type: 'object',
  properties: {
    rewardAccount: addressType,
    instances: {
      type: 'object',
      properties: {
        dai: erc20InstanceSchema({
          symbol: 'DAI',
          decimals: 18,
          declared: STABLE_AMOUNTS
        }),
        usdt: erc20InstanceSchema({
          symbol: 'USDT',
          decimals: 6,
          declared: STABLE_AMOUNTS,
          required: ['100', '1000']
        }),
        usdc: erc20InstanceSchema({
          symbol: 'USDC',
          decimals: 6,
          declared: STABLE_AMOUNTS,
          required: ['100', '1000']
        }),
        cdai: erc20InstanceSchema({
          symbol: 'cDAI',
          decimals: 8,
          declared: ['5000', '50000', '500000', '5000000']
        }),
        wbtc: erc20InstanceSchema({
          symbol: 'WBTC',
          decimals: 8,
          declared: ETH_AMOUNTS,
          required: ['0.1', '1', '10']
        }),
        eth: nativeInstanceSchema({ declared: ETH_AMOUNTS, required: ETH_AMOUNTS })
      },
      required: ['eth']
    },
    gasPrices: {
      type: 'object',
      properties: {
        fast: { type: 'number' },
        additionalProperties: { type: 'number' }
      },
      required: ['fast']
    },
    netId: { type: 'integer' },
    ethPrices: {
      type: 'object',
      properties: {
        dai: { type: 'string', BN: true },
        cdai: { type: 'string', BN: true },
        usdc: { type: 'string', BN: true },
        usdt: { type: 'string', BN: true },
        torn: { type: 'string', BN: true },
        wbtc: { type: 'string', BN: true }
      },
      required: ['dai', 'cdai', 'usdc', 'usdt', 'torn', 'wbtc']
    },
    tornadoServiceFee: { type: 'number', maximum: 20, minimum: 0 },
    latestBlock: { type: 'number' },
    version: { type: 'string' },
    health: healthSchema,
    currentQueue: { type: 'number' }
  },
  required: ['rewardAccount', 'instances', 'netId', 'ethPrices', 'tornadoServiceFee', 'version', 'health']
}

// Sepolia relayers only quote a DAI price, so mainnet's six-token ethPrices requirement is
// narrowed rather than the whole schema being restated.
const sepoliaRelayer = {
  ...defaultRelayer,
  properties: {
    ...defaultRelayer.properties,
    ethPrices: {
      ...defaultRelayer.properties.ethPrices,
      required: ['dai']
    }
  }
}

export default {
  l2Relayer: nativeCurrencyStatusSchema({ currency: 'eth', declared: ETH_AMOUNTS }),
  bscRelayer: nativeCurrencyStatusSchema({ currency: 'bnb', declared: ETH_AMOUNTS }),
  etcRelayer: nativeCurrencyStatusSchema({ currency: 'etc', declared: ['1', '10', '100'] }),
  xdaiRelayer: nativeCurrencyStatusSchema({ currency: 'xdai', declared: STABLE_AMOUNTS }),
  polygonRelayer: nativeCurrencyStatusSchema({ currency: 'matic', declared: STABLE_AMOUNTS }),
  avalancheRelayer: nativeCurrencyStatusSchema({ currency: 'avax', declared: ['10', '100', '500'] }),
  defaultRelayer,
  sepoliaRelayer
}
