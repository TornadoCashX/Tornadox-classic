const { assertSha256, sha256Hex } = require('./assetIntegrity')

describe('proof asset integrity', () => {
  it('calculates SHA-256 and rejects changed bytes', async () => {
    const bytes = new TextEncoder().encode('abc')
    const expected = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

    await expect(sha256Hex(bytes)).resolves.toBe(expected)
    await expect(assertSha256(bytes, expected, 'fixture')).resolves.toBeUndefined()
    await expect(assertSha256(new TextEncoder().encode('changed'), expected, 'fixture')).rejects.toThrow(
      'fixture integrity check failed'
    )
  })
})
