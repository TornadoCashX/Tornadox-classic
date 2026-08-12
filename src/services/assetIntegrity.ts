const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

export const sha256Hex = async (data: ArrayBuffer | ArrayBufferView): Promise<string> => {
  const source = ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data)
  const bytes = new Uint8Array(source.byteLength)
  bytes.set(source)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return toHex(new Uint8Array(digest))
}

export const assertSha256 = async (
  data: ArrayBuffer | ArrayBufferView,
  expectedSha256: string,
  label: string
): Promise<void> => {
  const actualSha256 = await sha256Hex(data)
  if (actualSha256 !== expectedSha256.toLowerCase()) {
    throw new Error(`${label} integrity check failed`)
  }
}
