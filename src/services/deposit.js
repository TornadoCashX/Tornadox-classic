import crypto from 'crypto'
import { Buffer } from 'buffer'

import { buffPedersenHash, ensurePedersenReady, leInt2Buff, toFixedHex } from '@/utils/crypto'

const NOTE_BYTES = 31

export const createDepositNote = async () => {
  await ensurePedersenReady()

  const nullifierBuffer = crypto.randomBytes(NOTE_BYTES)
  const secretBuffer = crypto.randomBytes(NOTE_BYTES)
  const preimage = Buffer.concat([nullifierBuffer, secretBuffer])
  const commitment = buffPedersenHash(preimage)
  const nullifier = leInt2Buff(nullifierBuffer)
  const secret = leInt2Buff(secretBuffer)

  return {
    note: `0x${preimage.toString('hex')}`,
    commitment,
    commitmentHex: toFixedHex(commitment),
    nullifier,
    secret
  }
}
