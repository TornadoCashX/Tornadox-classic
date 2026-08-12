const { MerkleTree } = require('@tornado/fixed-merkle-tree')
const { buildMimcSponge } = require('circomlibjs')

const { LEGACY_PROOF_MANIFEST } = require('@/config/legacyProofManifest')
const { buildWithdrawalArgs, buildWithdrawalInput } = require('@/services/withdrawal')
const { ensurePedersenReady, parseNote } = require('@/utils/crypto')
const fixture = require('./legacyWithdrawalProof.fixture.json')

describe('known legacy withdrawal proof fixture', () => {
  it('rebuilds the note, Merkle path and public proof inputs', async () => {
    await ensurePedersenReady()
    const note = parseNote(fixture.note)
    const mimc = await buildMimcSponge()
    const tree = new MerkleTree(fixture.tree.levels, [note.commitmentHex], {
      zeroElement: fixture.tree.pathElements[0],
      hashFunction: (left, right) =>
        mimc.F.toString(mimc.multiHash([BigInt(String(left)), BigInt(String(right))]))
    })
    const path = tree.path(fixture.tree.leafIndex)
    const input = buildWithdrawalInput({
      fee: fixture.withdrawal.fee,
      root: tree.root,
      refund: fixture.withdrawal.refund,
      relayer: fixture.withdrawal.relayer,
      recipient: fixture.withdrawal.recipient,
      note,
      pathElements: path.pathElements,
      pathIndices: path.pathIndices
    })

    expect(note.commitmentHex).toBe(fixture.commitment)
    expect(note.nullifierHex).toBe(fixture.nullifierHash)
    expect(String(tree.root)).toBe(fixture.tree.root)
    expect(path.pathElements.map(String)).toEqual(fixture.tree.pathElements)
    expect(path.pathIndices).toEqual(fixture.tree.pathIndices)
    expect(buildWithdrawalArgs(input)).toEqual(fixture.withdrawal.args)
    expect(fixture.withdrawal.proof).toMatch(/^0x[0-9a-f]{512}$/)
  })

  it('records the exact runtime and proving asset hashes', () => {
    expect(fixture.legacyRuntime).toEqual({
      websnarkVersion: LEGACY_PROOF_MANIFEST.runtime.websnarkVersion,
      snarkjsVersion: LEGACY_PROOF_MANIFEST.runtime.snarkjsVersion,
      bigIntegerVersion: LEGACY_PROOF_MANIFEST.runtime.bigIntegerVersion,
      bundleSha256: LEGACY_PROOF_MANIFEST.runtime.bundleSha256,
      circuitSha256: LEGACY_PROOF_MANIFEST.assets.circuit.sha256,
      provingKeySha256: LEGACY_PROOF_MANIFEST.assets.provingKey.sha256
    })
  })
})
