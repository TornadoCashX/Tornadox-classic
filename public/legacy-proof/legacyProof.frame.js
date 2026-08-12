let circuit
let provingKey
let runtimePromise
const parentOrigin = document.querySelector('meta[name="legacy-proof-parent-origin"]')?.content

if (!parentOrigin) throw new Error('Legacy proof parent origin is missing')

const toHex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

const sha256Hex = async (buffer) => {
  const digest = await window.crypto.subtle.digest('SHA-256', buffer)
  return toHex(new Uint8Array(digest))
}

const waitForRuntime = async () => {
  const timeoutAt = Date.now() + 60000
  while (
    typeof window.genZKSnarkProofAndWitness !== 'function' ||
    typeof window.zkSnarkProofToSolidityInput !== 'function'
  ) {
    if (Date.now() >= timeoutAt) throw new Error('Legacy proof runtime initialization timed out')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

const loadRuntime = ({ bundleUrl, bundleSha256, wasmInitialMemory, concurrency }) => {
  if (runtimePromise) return runtimePromise

  runtimePromise = (async () => {
    const response = await fetch(bundleUrl, { cache: 'force-cache' })
    if (!response.ok) throw new Error(`Cannot fetch legacy proof runtime (${response.status})`)
    const source = await response.arrayBuffer()
    if ((await sha256Hex(source)) !== bundleSha256) {
      throw new Error('Legacy proof runtime integrity check failed')
    }

    window.__legacyProofBuildOptions = { wasmInitialMemory, concurrency }
    document.documentElement.dataset.proofStage = 'runtime-loading'
    await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = bundleUrl
      script.onload = resolve
      script.onerror = () => reject(new Error('Cannot execute legacy proof runtime'))
      document.head.append(script)
    })
    document.documentElement.dataset.proofStage = 'groth-initializing'
    await waitForRuntime()
    document.documentElement.dataset.proofStage = 'runtime-ready'
  })()

  return runtimePromise
}

const serializeError = (error) => ({
  message: error instanceof Error ? error.message : String(error),
  name: error instanceof Error ? error.name : 'Error',
  stack: error instanceof Error ? error.stack : undefined
})

window.addEventListener('message', async ({ data, origin, source }) => {
  if (origin !== parentOrigin || data?.type !== 'prove' || !source) return

  try {
    await loadRuntime(data.runtime)
    if (!circuit && data.circuit) circuit = data.circuit
    if (!provingKey && data.provingKey) provingKey = data.provingKey
    if (!circuit || !provingKey) throw new Error('Legacy proof assets are not initialized')

    const proofData = await window.genZKSnarkProofAndWitness(data.input, circuit, provingKey)
    const { proof } = window.zkSnarkProofToSolidityInput(proofData)
    source.postMessage({ id: data.id, type: 'result', proof }, { targetOrigin: origin })
  } catch (error) {
    source.postMessage({ id: data.id, type: 'error', error: serializeError(error) }, { targetOrigin: origin })
  }
})

window.parent.postMessage({ type: 'legacy-proof-frame-ready' }, parentOrigin)
