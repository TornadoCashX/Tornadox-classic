const { createHash } = require('node:crypto')
const { readFileSync } = require('node:fs')
const path = require('node:path')

const { LEGACY_PROOF_MANIFEST } = require('./legacyProofManifest')

const fileSha256 = (filePath) => createHash('sha256').update(readFileSync(filePath)).digest('hex')

describe('legacy proof manifest', () => {
  const publicPath = path.resolve(__dirname, '../../public')

  it.each([
    ['runtime bundle', LEGACY_PROOF_MANIFEST.runtime.bundlePath, LEGACY_PROOF_MANIFEST.runtime.bundleSha256],
    [
      'circuit',
      `/${LEGACY_PROOF_MANIFEST.assets.circuit.localName}`,
      LEGACY_PROOF_MANIFEST.assets.circuit.sha256
    ],
    [
      'proving key',
      `/${LEGACY_PROOF_MANIFEST.assets.provingKey.localName}`,
      LEGACY_PROOF_MANIFEST.assets.provingKey.sha256
    ]
  ])('pins the %s SHA-256', (_name, publicFile, expectedSha256) => {
    expect(fileSha256(path.join(publicPath, publicFile))).toBe(expectedSha256)
  })

  it('pins the complete legacy dependency chain', () => {
    expect(LEGACY_PROOF_MANIFEST.runtime).toMatchObject({
      websnarkVersion: '0.0.4',
      snarkjsVersion: '0.1.20',
      bigIntegerVersion: '1.6.42'
    })
  })
})
