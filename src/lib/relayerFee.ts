// Ports the relayer-fee half of store/fees.js/store/application.js's relayerWithdrawalTxData.
import { createFeeOracle } from '@/services/feeCalculator'
import { buildRelayerWithdrawalTx } from '@/services/withdrawal'
import { getCurrentRpcUrl, getNetworkConfig } from './networkHelpers'
import { ensureRpcSelected } from './rpcSelect'
import { getInstanceAddress, getTornadoProxyAddress } from './contracts'

export interface RelayerTransaction {
  to: string
  data: string
  value: string | number
}

const getFeeOracle = async (netId: number) => {
  const config = getNetworkConfig(netId)
  await ensureRpcSelected(netId)
  return createFeeOracle(netId, getCurrentRpcUrl(netId), config.gasPrices)
}

export const calculateRelayerRefund = async (netId: number, currency: string): Promise<string> => {
  const config = getNetworkConfig(netId)
  if (currency === config.nativeCurrency) return '0'
  const oracle = await getFeeOracle(netId)
  const refund = await oracle.calculateRefundInETH(currency.toLowerCase())
  return BigInt(refund).toString()
}

export const buildRelayerTransaction = ({
  netId,
  currency,
  amount,
  proof,
  withdrawCallArgs
}: {
  netId: number
  currency: string
  amount: string | number
  proof: string
  withdrawCallArgs: string[]
}): RelayerTransaction => {
  return buildRelayerWithdrawalTx({
    tornadoProxyAddress: getTornadoProxyAddress(netId),
    tornadoInstanceAddress: getInstanceAddress(netId, currency, amount),
    proof,
    withdrawCallArgs
  })
}

// tx is omitted for the mainnet pre-check (V4's oracle looks up a fixed gas limit for
// 'user_withdrawal' by chain id and never touches tx - see feeOracleV4.js), and supplied once
// the real withdrawal tx has been built for non-mainnet chains (V5 needs it for an accurate,
// L2-data-fee-inclusive estimate).
export const calculateRelayerFee = async ({
  netId,
  currency,
  amount,
  feePercent,
  refundInEth = '0',
  tokenPriceInEth,
  tx
}: {
  netId: number
  currency: string
  amount: string | number
  feePercent: number
  refundInEth?: string
  tokenPriceInEth?: string
  tx?: RelayerTransaction
}): Promise<string> => {
  const config = getNetworkConfig(netId)
  const decimals = config.tokens[currency].decimals
  const isToken = currency !== config.nativeCurrency

  if (isToken && !tokenPriceInEth) {
    throw new Error(`Relayer did not provide a ${config.tokens[currency].symbol} price`)
  }
  const oracle = await getFeeOracle(netId)

  const fee = await oracle.calculateWithdrawalFeeViaRelayer(
    'user_withdrawal',
    tx,
    feePercent,
    currency.toLowerCase(),
    amount,
    decimals,
    refundInEth,
    tokenPriceInEth
  )

  return BigInt(fee).toString()
}
