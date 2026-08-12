import { TornadoFeeOracleV4, TornadoFeeOracleV5 } from '@tornado/tornado-oracles'

const SEPOLIA_CHAIN_ID = 11155111
const GOERLI_CHAIN_ID = 5
const feeOracleCache = new Map()

export const resolveFeeOracleChainId = (netId) => {
  // tornado-oracles@2.1.0 predates Sepolia. Its Goerli model supplies the
  // Ethereum testnet fallback gas limit while the provider remains Sepolia.
  return Number(netId) === SEPOLIA_CHAIN_ID ? GOERLI_CHAIN_ID : Number(netId)
}

const useConfiguredRpcFallback = (feeOracle) => {
  const legacyOracle = feeOracle?.oracle?.legacy
  if (!legacyOracle) return

  Object.keys(legacyOracle.offChainOracles).forEach((name) => legacyOracle.removeOffChainOracle(name))
  Object.keys(legacyOracle.onChainOracles).forEach((name) => legacyOracle.removeOnChainOracle(name))
}

export const createFeeOracle = (netId, rpcUrl, gasPrices) => {
  const oracleChainId = resolveFeeOracleChainId(netId)
  const cacheKey = `${netId}:${rpcUrl}`

  if (feeOracleCache.has(cacheKey)) return feeOracleCache.get(cacheKey)

  const oracle =
    Number(netId) === 1
      ? new TornadoFeeOracleV4(oracleChainId, rpcUrl, gasPrices)
      : new TornadoFeeOracleV5(oracleChainId, rpcUrl, gasPrices)

  // The bundled third-party gas stations include retired or non-CORS browser
  // endpoints. Keep each chain's fee model, but make its configured RPC the
  // only legacy fallback.
  useConfiguredRpcFallback(oracle)
  useConfiguredRpcFallback(oracle.fallbackFeeOracle)

  feeOracleCache.set(cacheKey, oracle)
  return oracle
}
