const { deflateSync } = require('zlib')

const { inflateDownloadedAsset, isZlibStream } = require('./runtimeAssets')

describe('runtime asset decompression', () => {
  test('inflates the zlib payload shipped in public assets', async () => {
    const original = Buffer.from('{"circuit":"ok"}')
    const compressed = deflateSync(original)

    expect(isZlibStream(compressed)).toBe(true)
    await expect(inflateDownloadedAsset(compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength)))
      .resolves.toEqual(original)
  })

  test('accepts bytes already decompressed by the static host', async () => {
    const original = Buffer.from('{"circuit":"ok"}')

    expect(isZlibStream(original)).toBe(false)
    await expect(inflateDownloadedAsset(original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength)))
      .resolves.toEqual(original)
  })
})
