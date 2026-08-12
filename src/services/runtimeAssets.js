// @ts-check
/* eslint-disable no-console */
import axios from 'axios'

import { LEGACY_PROOF_MANIFEST } from '@/config/legacyProofManifest'
import { assertSha256 } from '@/services/assetIntegrity'

let tornadoKeys = null
let tornadoKeysPromise = null

/** @param {(progress: number) => void} [getProgress] */
export async function getTornadoKeys(getProgress) {
  if (tornadoKeys) {
    if (typeof getProgress === 'function') getProgress(100)
    return tornadoKeys
  }

  if (!tornadoKeysPromise) {
    tornadoKeysPromise = Promise.all([
      download({
        name: LEGACY_PROOF_MANIFEST.assets.circuit.localName,
        expectedSha256: LEGACY_PROOF_MANIFEST.assets.circuit.sha256
      }),
      download({
        name: LEGACY_PROOF_MANIFEST.assets.provingKey.localName,
        expectedSha256: LEGACY_PROOF_MANIFEST.assets.provingKey.sha256,
        getProgress
      })
    ]).then(([circuit, provingKey]) => ({
      circuit: JSON.parse(circuit.toString()),
      provingKey: provingKey.buffer.slice(
        provingKey.byteOffset,
        provingKey.byteOffset + provingKey.byteLength
      )
    }))
  }

  try {
    tornadoKeys = await tornadoKeysPromise
    if (typeof getProgress === 'function') getProgress(100)
    return tornadoKeys
  } catch (error) {
    tornadoKeysPromise = null
    throw error
  }
}

/** @param {{url: string, name: string, getProgress?: (progress: number) => void}} options */
async function fetchFile({ url, name, getProgress }) {
  return axios.get(`${url}/${name}`, {
    responseType: 'blob',
    onDownloadProgress: (progressEvent) => {
      if (typeof getProgress === 'function' && progressEvent.total) {
        getProgress(Math.min(99, Math.round((progressEvent.loaded * 100) / progressEvent.total)))
      }
    }
  })
}

/** @type {() => string} */
let assetBaseUrlResolver = () => {
  throw new Error('Asset runtime adapter is not configured')
}

export const configureRuntimeAssets = ({ getAssetBaseUrl }) => {
  if (typeof getAssetBaseUrl !== 'function') {
    throw new TypeError('getAssetBaseUrl adapter must be a function')
  }
  assetBaseUrlResolver = getAssetBaseUrl
}

/** @param {Uint8Array} bytes */
export function isZlibStream(bytes) {
  if (bytes.length < 2) return false
  const cmf = bytes[0]
  const flg = bytes[1]
  return (cmf & 0x0f) === 8 && cmf >> 4 <= 7 && ((cmf << 8) + flg) % 31 === 0
}

/**
 * Some static hosts infer `Content-Encoding: gzip` from the historical `.gz` filenames even
 * though these files contain zlib streams. Others transparently decode them before JavaScript
 * receives the response. Accept both forms so a completed download is not reported as a network
 * failure merely because the host already returned the uncompressed bytes.
 * @param {ArrayBuffer} buffer
 */
export async function inflateDownloadedAsset(buffer) {
  const bytes = Buffer.from(buffer)
  if (!isZlibStream(bytes)) return bytes

  if (typeof DecompressionStream !== 'undefined') {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))
      return Buffer.from(await new Response(stream).arrayBuffer())
    } catch {
      // Fall through to the established browser zlib polyfill.
    }
  }

  const zlibModule = await import('zlib')
  const zlib = zlibModule.default || zlibModule
  return zlib.inflateSync(bytes)
}

/** @param {{name: string, expectedSha256?: string, getProgress?: (progress: number) => void}} options */
export async function download({ name, expectedSha256, getProgress }) {
  const prefix = assetBaseUrlResolver()
  const response = await fetchFile({ getProgress, url: prefix, name })
  const buffer = await response.data.arrayBuffer()
  if (expectedSha256) await assertSha256(buffer, expectedSha256, name)
  return inflateDownloadedAsset(buffer)
}
