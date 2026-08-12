jest.mock('@/services/schema', () => ({
  getRelayerValidateFunction: () => {
    const validate = jest.fn(() => true)
    validate.errors = null
    return validate
  }
}))

const {
  RelayerJobWatchReason,
  buildRelayerSelection,
  ensureTrailingSlash,
  fetchRelayerJob,
  fetchRelayerStatus,
  isRelayerVersionSupported,
  pollRelayerJobUntilTerminal,
  submitTornadoWithdraw,
  validateRelayerStatus
} = require('./relayerClient')

const jsonResponse = (status, body) => ({
  status,
  json: jest.fn().mockResolvedValue(body)
})

describe('relayer client service', () => {
  it('normalizes the built-in relayer base URL', () => {
    expect(ensureTrailingSlash('https://relayer.example')).toBe('https://relayer.example/')
  })

  it('keeps official relayer version compatibility rules explicit', () => {
    expect(isRelayerVersionSupported({ version: '4.1.6', netId: 1 })).toBe(true)
    expect(isRelayerVersionSupported({ version: '5.2.1', netId: 1 })).toBe(false)
    expect(isRelayerVersionSupported({ version: '5.2.1', netId: 56 })).toBe(true)
    expect(isRelayerVersionSupported({ version: '5.2.1-beta.1', netId: 56 })).toBe(false)
  })

  it('validates relayer status before selecting it', () => {
    expect(validateRelayerStatus({ status: { netId: 56, currentQueue: 0 }, netId: 1 })).toMatchObject({
      isValid: false,
      error: 'thisRelayerServesADifferentNetwork'
    })
    expect(
      validateRelayerStatus({
        status: { netId: 1, currentQueue: 6, version: '4.1.6' },
        netId: 1
      })
    ).toMatchObject({ isValid: false, error: 'withdrawalQueueIsOverloaded' })
  })

  it('fetches status through the official status endpoint', async () => {
    const axios = {
      get: jest.fn().mockResolvedValue({ data: { netId: 1 } })
    }

    await expect(fetchRelayerStatus({ axios, relayerUrl: 'https://relayer.example' })).resolves.toEqual({
      url: 'https://relayer.example/',
      status: { netId: 1 }
    })
    expect(axios.get).toHaveBeenCalledWith('https://relayer.example/status', { timeout: 10000 })
  })

  it('builds selected relayer state without leaking raw status shape into Vuex', () => {
    expect(
      buildRelayerSelection({
        name: 'custom',
        realUrl: 'https://relayer.example/',
        status: {
          rewardAccount: '0xabc',
          tornadoServiceFee: 0.36,
          ethPrices: { dai: '1' }
        }
      })
    ).toEqual({
      isValid: true,
      name: 'custom',
      url: 'https://relayer.example/',
      address: '0xabc',
      tornadoServiceFee: 0.36,
      ethPrices: { dai: '1' }
    })
  })

  it('submits withdrawal requests and validates the relayer job id', async () => {
    const fetchApi = jest.fn().mockResolvedValue(jsonResponse(200, { id: 'job-id' }))

    await expect(
      submitTornadoWithdraw({
        fetchApi,
        relayerUrl: 'https://relayer.example',
        message: { contract: '0xpool' }
      })
    ).resolves.toBe('job-id')
    expect(fetchApi).toHaveBeenCalledWith(
      'https://relayer.example/v1/tornadoWithdraw',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
    )
    expect(fetchApi).toHaveBeenCalledTimes(1)
  })

  it('surfaces business errors from withdrawal submission', async () => {
    const fetchApi = jest.fn().mockResolvedValue(jsonResponse(400, { error: 'nullifier already spent' }))

    await expect(
      submitTornadoWithdraw({
        fetchApi,
        relayerUrl: 'https://relayer.example/',
        message: {}
      })
    ).rejects.toThrow('nullifier already spent')
  })

  it('loads relayer jobs without forcing a CORS preflight header', async () => {
    const fetchApi = jest.fn().mockResolvedValue(jsonResponse(200, { status: 'CONFIRMED', txHash: '0xhash' }))

    await expect(
      fetchRelayerJob({ fetchApi, relayerUrl: 'https://relayer.example', id: 'job-id' })
    ).resolves.toEqual({
      status: 'CONFIRMED',
      txHash: '0xhash'
    })
    expect(fetchApi.mock.calls[0][1]).not.toHaveProperty('headers')
    expect(fetchApi.mock.calls[0][0]).toBe('https://relayer.example/v1/jobs/job-id')
  })

  it('marks temporary job endpoint failures as retryable', async () => {
    const fetchApi = jest.fn().mockResolvedValue(jsonResponse(502, {}))

    await expect(
      fetchRelayerJob({ fetchApi, relayerUrl: 'https://relayer.example/', id: 'job-id' })
    ).rejects.toMatchObject({
      message: 'relayerIsNotResponding',
      isTransient: true
    })
  })

  it('marks network job polling errors as retryable', async () => {
    const fetchApi = jest.fn().mockRejectedValue(new Error('temporary network error'))

    await expect(
      fetchRelayerJob({ fetchApi, relayerUrl: 'https://relayer.example/', id: 'job-id' })
    ).rejects.toMatchObject({
      message: 'temporary network error',
      isTransient: true
    })
  })
})

describe('pollRelayerJobUntilTerminal', () => {
  const buildJobGetter = (job) => () => job

  it('resolves once the relayer job is confirmed', async () => {
    const fetchJob = jest
      .fn()
      .mockResolvedValue({ status: 'CONFIRMED', txHash: '0xtxhash', confirmations: 1 })
    const onUpdate = jest.fn()

    const result = pollRelayerJobUntilTerminal({
      id: 'jobId',
      getJob: buildJobGetter({ relayerUrl: 'https://relayer.example/', status: 'SENT' }),
      fetchJob,
      onUpdate
    })

    await expect(result).resolves.toMatchObject({ status: 'CONFIRMED', txHash: '0xtxhash' })
    expect(onUpdate).toHaveBeenCalledWith({ status: 'CONFIRMED', txHash: '0xtxhash', confirmations: 1 })
  })

  it('retries a transient fetch error before resolving', async () => {
    const scheduleRetry = jest.fn((fn) => Promise.resolve().then(fn))
    const fetchJob = jest
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('temporary network error'), { isTransient: true }))
      .mockResolvedValueOnce({ status: 'CONFIRMED', txHash: '0xtxhash' })

    const result = pollRelayerJobUntilTerminal({
      id: 'jobId',
      getJob: buildJobGetter({ relayerUrl: 'https://relayer.example/', status: 'SENT' }),
      fetchJob,
      scheduleRetry
    })

    await expect(result).resolves.toMatchObject({ status: 'CONFIRMED' })
    expect(fetchJob).toHaveBeenCalledTimes(2)
  })

  it('keeps polling while the job status is still pending', async () => {
    const scheduleRetry = jest.fn((fn) => Promise.resolve().then(fn))
    const fetchJob = jest
      .fn()
      .mockResolvedValueOnce({ status: 'SENT' })
      .mockResolvedValueOnce({ status: 'CONFIRMED', txHash: '0xtxhash' })

    const result = pollRelayerJobUntilTerminal({
      id: 'jobId',
      getJob: buildJobGetter({ relayerUrl: 'https://relayer.example/', status: 'SENT' }),
      fetchJob,
      scheduleRetry
    })

    await expect(result).resolves.toMatchObject({ status: 'CONFIRMED' })
    expect(fetchJob).toHaveBeenCalledTimes(2)
  })

  it('rejects immediately on a non-transient relayer error without retrying', async () => {
    const scheduleRetry = jest.fn()
    const fetchJob = jest.fn().mockRejectedValue(new Error('unknownError'))

    const result = pollRelayerJobUntilTerminal({
      id: 'jobId',
      getJob: buildJobGetter({ relayerUrl: 'https://relayer.example/', status: 'SENT' }),
      fetchJob,
      scheduleRetry
    })

    await expect(result).rejects.toMatchObject({ reason: RelayerJobWatchReason.RELAYER_ERROR })
    expect(scheduleRetry).not.toHaveBeenCalled()
  })

  it('rejects when the relayer reports the job as FAILED', async () => {
    const onUpdate = jest.fn()
    const fetchJob = jest.fn().mockResolvedValue({ status: 'FAILED', failedReason: 'reverted' })

    const result = pollRelayerJobUntilTerminal({
      id: 'jobId',
      getJob: buildJobGetter({ relayerUrl: 'https://relayer.example/', status: 'SENT' }),
      fetchJob,
      onUpdate
    })

    await expect(result).rejects.toMatchObject({ reason: RelayerJobWatchReason.RELAYER_ERROR })
    expect(onUpdate).toHaveBeenCalledWith({ status: 'FAILED', failedReason: 'reverted' })
  })

  it('rejects when the job has already been deleted from local state', async () => {
    const fetchJob = jest.fn()

    const result = pollRelayerJobUntilTerminal({
      id: 'jobId',
      getJob: buildJobGetter(undefined),
      fetchJob
    })

    await expect(result).rejects.toMatchObject({ reason: RelayerJobWatchReason.NOT_FOUND })
    expect(fetchJob).not.toHaveBeenCalled()
  })

  it('rejects when a watchdog timeout already marked the job FAILED locally', async () => {
    const fetchJob = jest.fn()

    const result = pollRelayerJobUntilTerminal({
      id: 'jobId',
      getJob: buildJobGetter({ relayerUrl: 'https://relayer.example/', status: 'FAILED' }),
      fetchJob
    })

    await expect(result).rejects.toMatchObject({ reason: RelayerJobWatchReason.STALE_FAILED })
    expect(fetchJob).not.toHaveBeenCalled()
  })
})
