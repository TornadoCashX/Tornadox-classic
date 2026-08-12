export const LEGACY_PROOF_MANIFEST = Object.freeze({
  runtime: Object.freeze({
    websnarkVersion: '0.0.4',
    snarkjsVersion: '0.1.20',
    bigIntegerVersion: '1.6.42',
    framePath: '/legacy-proof/legacyProof.frame.js',
    bundlePath: '/legacy-proof/websnark-0.0.4-50fa113b.js',
    bundleSha256: '50fa113b8335882eb67678573a81f4720e9d55917e992a2b6f1fa22995ffa0aa'
  }),
  assets: Object.freeze({
    circuit: Object.freeze({
      localName: 'tornado-29a1cc5303d99516.json.zlib',
      sha256: '29a1cc5303d995168f450402b1b2bf65d7e4b54811289b1f2b7a337aab61a8fb'
    }),
    provingKey: Object.freeze({
      localName: 'tornadoProvingKey-6b8874fcf0400ad3.bin.zlib',
      sha256: '6b8874fcf0400ad39683aadf7828f331a8ef0c651a8171404dc8fa2bcb190d3b'
    })
  })
})

export type LegacyProofManifest = typeof LEGACY_PROOF_MANIFEST
