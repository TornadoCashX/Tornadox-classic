const CHAIN_IDS = [1, 10, 56, 61, 100, 137, 42161, 43114, 11155111]

const readBuildConfig = () => ({
  graphApiKeys: CHAIN_IDS.reduce((result, chainId) => {
    result[chainId] = ''
    return result
  }, {}),
  relayers: CHAIN_IDS.reduce((result, chainId) => {
    result[chainId] = {
      name: '',
      url: ''
    }
    return result
  }, {}),
  siteUrl: '',
  walletConnectProjectId: ''
})

let runtimeOverrides = {}

export const configurePublicRuntimeConfig = (config = {}) => {
  runtimeOverrides = {
    ...runtimeOverrides,
    ...config,
    graphApiKeys: {
      ...(runtimeOverrides.graphApiKeys || {}),
      ...(config.graphApiKeys || {})
    },
    relayers: {
      ...(runtimeOverrides.relayers || {}),
      ...(config.relayers || {})
    }
  }
}

export const getPublicRuntimeConfig = () => {
  const buildConfig = readBuildConfig()
  return {
    ...buildConfig,
    ...runtimeOverrides,
    graphApiKeys: {
      ...buildConfig.graphApiKeys,
      ...(runtimeOverrides.graphApiKeys || {})
    },
    relayers: {
      ...buildConfig.relayers,
      ...(runtimeOverrides.relayers || {})
    }
  }
}

export const getGraphApiKey = (chainId) => getPublicRuntimeConfig().graphApiKeys[Number(chainId)] || ''

export const getConfiguredRelayerRuntime = (chainId) => {
  const config = getPublicRuntimeConfig()
  const relayer = config.relayers[Number(chainId)] || {}
  return {
    name: relayer.name || 'Relayer',
    url: relayer.url || ''
  }
}
