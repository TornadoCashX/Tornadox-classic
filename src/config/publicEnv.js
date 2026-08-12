import { getConfiguredRelayerRuntime, getGraphApiKey } from './runtimeConfig'

export { getGraphApiKey }

export const getRelayerConfig = () => ({
  getConfiguredRelayer: getConfiguredRelayerRuntime
})
