import { LEGACY_PROOF_MANIFEST } from '@/config/legacyProofManifest'

interface LegacyProofAssets {
  circuit: unknown
  provingKey: ArrayBuffer
}

interface LegacyProofResponse {
  id?: number
  type: 'result' | 'error' | 'legacy-proof-frame-ready'
  proof?: string
  error?: { message?: string; name?: string; stack?: string }
}

interface PendingProof {
  resolve: (proof: string) => void
  reject: (error: Error) => void
}

interface LegacyProofEndpoint {
  ready: Promise<void>
  postMessage: (message: unknown, transfer?: Transferable[]) => void
  terminate: () => void
  onmessage: ((event: MessageEvent<LegacyProofResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
}

type EndpointFactory = () => LegacyProofEndpoint

const serializeBigInts = (value: unknown): unknown => {
  if (typeof value === 'bigint') return value.toString(10)
  if (Array.isArray(value)) return value.map(serializeBigInts)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serializeBigInts(entry)]))
  }
  return value
}

const createFrameEndpoint = (): LegacyProofEndpoint => {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('title', 'Legacy proof runtime')
  Object.assign(frame.style, {
    border: '0',
    height: '1px',
    left: '-10000px',
    position: 'fixed',
    top: '0',
    width: '1px'
  })
  const frameScriptUrl = new URL(LEGACY_PROOF_MANIFEST.runtime.framePath, window.location.origin).href
  frame.srcdoc = `<!doctype html><meta charset="utf-8"><meta name="legacy-proof-parent-origin" content="${window.location.origin}"><script src="${frameScriptUrl}"><\/script>`

  let resolveReady!: () => void
  let rejectReady!: (error: Error) => void
  let readySettled = false
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  const readyTimeout = window.setTimeout(() => {
    if (readySettled) return
    readySettled = true
    rejectReady(new Error('Legacy proof frame initialization timed out'))
  }, 30000)
  const endpoint: LegacyProofEndpoint = {
    ready,
    onmessage: null,
    onerror: null,
    postMessage(message, transfer = []) {
      if (!frame.contentWindow) throw new Error('Legacy proof frame is unavailable')
      frame.contentWindow.postMessage(message, window.location.origin, transfer)
    },
    terminate() {
      window.clearTimeout(readyTimeout)
      if (!readySettled) {
        readySettled = true
        rejectReady(new Error('Legacy proof runtime terminated'))
      }
      window.removeEventListener('message', onMessage)
      frame.remove()
    }
  }
  const onMessage = (event: MessageEvent<LegacyProofResponse>) => {
    if (event.source === frame.contentWindow && event.origin === window.location.origin) {
      if (event.data.type === 'legacy-proof-frame-ready') {
        if (!readySettled) {
          readySettled = true
          window.clearTimeout(readyTimeout)
          resolveReady()
        }
        return
      }
      endpoint.onmessage?.(event)
    }
  }
  window.addEventListener('message', onMessage)
  frame.addEventListener(
    'error',
    () => {
      const error = new Error('Legacy proof frame failed to load')
      if (!readySettled) {
        readySettled = true
        window.clearTimeout(readyTimeout)
        rejectReady(error)
      }
      endpoint.onerror?.(new ErrorEvent('error', { error, message: error.message }))
    },
    { once: true }
  )
  document.body.append(frame)
  return endpoint
}

export const createLegacyProofRuntime = ({
  createEndpoint = createFrameEndpoint
}: {
  createEndpoint?: EndpointFactory
} = {}) => {
  let endpoint: LegacyProofEndpoint | null = null
  let requestId = 0
  let assetsSent = false
  let queue = Promise.resolve()
  const pending = new Map<number, PendingProof>()

  const getEndpoint = () => {
    if (endpoint) return endpoint
    endpoint = createEndpoint()
    endpoint.onmessage = ({ data }) => {
      if (typeof data.id !== 'number') return
      const request = pending.get(data.id)
      if (!request) return
      pending.delete(data.id)
      if (data.type === 'result' && data.proof) {
        request.resolve(data.proof)
        return
      }
      const error = new Error(data.error?.message || 'Legacy proof generation failed')
      error.name = data.error?.name || 'Error'
      if (data.error?.stack) error.stack = data.error.stack
      assetsSent = false
      request.reject(error)
    }
    endpoint.onerror = (event) => {
      const error = new Error(event.message || 'Legacy proof frame failed')
      pending.forEach(({ reject }) => reject(error))
      pending.clear()
      endpoint?.terminate()
      endpoint = null
      assetsSent = false
    }
    return endpoint
  }

  const proveOnce = async (input: unknown, assets: LegacyProofAssets) => {
    const proofEndpoint = getEndpoint()
    try {
      await proofEndpoint.ready
    } catch (error) {
      proofEndpoint.terminate()
      if (endpoint === proofEndpoint) endpoint = null
      throw error
    }

    return new Promise<string>((resolve, reject) => {
      const id = ++requestId
      pending.set(id, { resolve, reject })
      const message: Record<string, unknown> = {
        id,
        type: 'prove',
        input: serializeBigInts(input),
        runtime: {
          bundleUrl: new URL(LEGACY_PROOF_MANIFEST.runtime.bundlePath, window.location.origin).href,
          bundleSha256: LEGACY_PROOF_MANIFEST.runtime.bundleSha256,
          wasmInitialMemory: /Mobi|Android/i.test(navigator.userAgent) ? 1000 : 2000,
          concurrency: Math.min(2, Math.max(1, navigator.hardwareConcurrency || 1))
        }
      }
      const transfer: Transferable[] = []
      if (!assetsSent) {
        const provingKey = assets.provingKey.slice(0)
        message.circuit = assets.circuit
        message.provingKey = provingKey
        transfer.push(provingKey)
        assetsSent = true
      }
      try {
        proofEndpoint.postMessage(message, transfer)
      } catch (error) {
        pending.delete(id)
        assetsSent = false
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  return {
    prove(input: unknown, assets: LegacyProofAssets): Promise<string> {
      const result = queue.then(() => proveOnce(input, assets))
      queue = result.then(
        () => undefined,
        () => undefined
      )
      return result
    },
    terminate() {
      endpoint?.terminate()
      endpoint = null
      assetsSent = false
      pending.forEach(({ reject }) => reject(new Error('Legacy proof runtime terminated')))
      pending.clear()
    }
  }
}

export const legacyProofRuntime = createLegacyProofRuntime()
