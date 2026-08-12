// @ts-check
import schema from '@/services/schema'
import { parseSemanticVersion } from '@/utils/stringUtils'

const RELAYER_STATUS_TIMEOUT = 10000

/** @typedef {Error & {isTransient?: boolean}} TransientError */

export const ensureTrailingSlash = (url) => {
  return url.endsWith('/') ? url : `${url}/`
}

export const isRelayerVersionSupported = ({ version, netId }) => {
  const { major, patch, prerelease } = parseSemanticVersion(version)
  // Save backwards compatibility with V4 relayers for Ethereum Mainnet.
  const requiredMajor = Number(netId) === 1 ? '4' : '5'

  if (prerelease) return false

  return major === requiredMajor && (Number(patch) >= 5 || Number(netId) !== 1)
}

export const validateRelayerStatus = ({ status, netId }) => {
  if (Number(status.netId) !== Number(netId)) {
    return { isValid: false, error: 'thisRelayerServesADifferentNetwork' }
  }

  if (Number(status.currentQueue) > 5) {
    return { isValid: false, error: 'withdrawalQueueIsOverloaded' }
  }

  const validate = schema.getRelayerValidateFunction(Number(netId))
  if (!validate) return { isValid: false, error: 'canNotFetchStatusFromTheRelayer' }
  const isValid = validate(status)

  if (!isValid) {
    return { isValid: false, error: 'canNotFetchStatusFromTheRelayer', validationErrors: validate?.errors }
  }

  if (!isRelayerVersionSupported({ version: status.version, netId })) {
    return { isValid: false, error: 'Outdated version.' }
  }

  return { isValid: true }
}

export const fetchRelayerStatus = async ({ axios, relayerUrl }) => {
  const url = ensureTrailingSlash(relayerUrl)

  const response = await axios.get(`${url}status`, {
    timeout: RELAYER_STATUS_TIMEOUT
  })

  return {
    url,
    status: response.data
  }
}

export const buildRelayerSelection = ({ name, realUrl, status }) => ({
  isValid: true,
  name,
  url: realUrl || '',
  address: status.rewardAccount || '',
  tornadoServiceFee: status.tornadoServiceFee || 0.0,
  ethPrices: status.ethPrices || { torn: '1' }
})

export const submitTornadoWithdraw = async ({ fetchApi = fetch, relayerUrl, message }) => {
  const baseUrl = ensureTrailingSlash(relayerUrl)
  const response = await fetchApi(`${baseUrl}v1/tornadoWithdraw`, {
    method: 'POST',
    mode: 'cors',
    cache: 'no-cache',
    headers: {
      'Content-Type': 'application/json'
    },
    redirect: 'error',
    body: JSON.stringify(message)
  })

  if (response.status === 400) {
    const { error } = await response.json()
    throw new Error(error)
  }

  if (response.status !== 200) {
    throw new Error('unknownError')
  }

  const { id } = await response.json()
  if (!id || typeof id !== 'string') {
    throw new Error('relayerError')
  }

  return id
}

export const fetchRelayerJob = async ({ fetchApi = fetch, relayerUrl, id }) => {
  let response

  try {
    const baseUrl = ensureTrailingSlash(relayerUrl)
    response = await fetchApi(`${baseUrl}v1/jobs/${id}`, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache',
      redirect: 'error'
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const error = Object.assign(new Error(message || 'relayerIsNotResponding'), { isTransient: true })
    throw error
  }

  if (response.status === 400) {
    const { error } = await response.json()
    throw new Error(error)
  }

  if (response.status >= 500) {
    const error = Object.assign(new Error('relayerIsNotResponding'), { isTransient: true })
    throw error
  }

  if (response.status !== 200) {
    throw new Error('unknownError')
  }

  return response.json()
}

export const RelayerJobWatchReason = {
  NOT_FOUND: 'not-found',
  STALE_FAILED: 'stale-failed',
  RELAYER_ERROR: 'relayer-error'
}

const DEFAULT_JOB_POLL_INTERVAL_MS = 3000

// Polls an in-flight relayer job until it reaches a terminal state (CONFIRMED/FAILED),
// the job disappears from the caller's own state, or a non-transient error occurs.
// Network/backoff mechanics live here; Vuex commits, notices, and i18n stay with the caller.
export const pollRelayerJobUntilTerminal = ({
  id,
  getJob,
  fetchJob = fetchRelayerJob,
  onUpdate,
  pollIntervalMs = DEFAULT_JOB_POLL_INTERVAL_MS,
  scheduleRetry = (fn, delay) => setTimeout(fn, delay)
}) => {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      const job = getJob()

      if (!job) {
        reject(
          Object.assign(new Error('Relayer job no longer exists'), {
            reason: RelayerJobWatchReason.NOT_FOUND
          })
        )
        return
      }

      if (job.status === 'FAILED') {
        reject(
          Object.assign(new Error('Relayer is not responding'), {
            reason: RelayerJobWatchReason.STALE_FAILED
          })
        )
        return
      }

      let jobStatus
      try {
        jobStatus = await fetchJob({ relayerUrl: job.relayerUrl, id })
      } catch (error) {
        const caught = /** @type {TransientError} */ (
          error instanceof Error ? error : new Error(String(error))
        )
        const isTransient = caught.isTransient || caught.message === 'relayerIsNotResponding'

        if (!isTransient) {
          reject(
            Object.assign(new Error('relayerError'), {
              reason: RelayerJobWatchReason.RELAYER_ERROR,
              cause: caught
            })
          )
          return
        }

        scheduleRetry(poll, pollIntervalMs)
        return
      }

      if (onUpdate) {
        onUpdate(jobStatus)
      }

      if (jobStatus.status === 'FAILED') {
        reject(
          Object.assign(new Error('relayerError'), {
            reason: RelayerJobWatchReason.RELAYER_ERROR,
            jobStatus
          })
        )
        return
      }

      if (jobStatus.status === 'CONFIRMED') {
        resolve(jobStatus)
        return
      }

      scheduleRetry(poll, pollIntervalMs)
    }

    poll()
  })
}
