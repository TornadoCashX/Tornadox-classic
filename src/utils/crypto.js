import crypto from 'crypto'

import { pedersen } from '@/services/pedersen'

const CUT_LENGTH = 31

const NOTE_PREFIX = 'tornado'
// '0x' + the nullifier and secret (CUT_LENGTH bytes each) hex-encoded.
const HEX_NOTE_LENGTH = 2 + CUT_LENGTH * 2 * 2
const isHexStrict = (value) => typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value)

// Structural validation for a serialized note, kept next to parseNote so every consumer shares
// one definition of "well formed". Returns an i18n key rather than throwing, because the two
// UI entry points (WithdrawTab.tsx, CompliancePage.tsx) need to tell the two failure modes apart:
// a malformed note is user error, a note for another chain is a prompt to switch networks. They
// each used to inline this same pair of checks; the netId comparison is optional here so
// non-interactive callers can validate shape alone.
/**
 * @param {unknown} note serialized note, `tornado-<currency>-<amount>-<netId>-<hex>`
 * @param {number|null} [netId] when given, also requires the note to belong to this chain
 * @returns {{isValid: true, errorKey: null} | {isValid: false, errorKey: string}}
 */
export function validateNote(note, netId = null) {
  if (typeof note !== 'string') return { isValid: false, errorKey: 'noteIsInvalid' }

  const parts = note.split('-')
  if (parts.length !== 5) return { isValid: false, errorKey: 'noteIsInvalid' }

  const [prefix, currency, amount, noteNetId, hexNote] = parts
  if (prefix !== NOTE_PREFIX || !currency || !amount) return { isValid: false, errorKey: 'noteIsInvalid' }
  if (!noteNetId || !Number.isFinite(Number(noteNetId))) return { isValid: false, errorKey: 'noteIsInvalid' }
  // Exact length, not a minimum: services/deposit.js builds every note as two 31-byte halves via
  // BN#toBuffer('le', 31), which pads to exactly that width, so a real note is always 0x + 124
  // hex chars. Accepting longer input isn't harmlessly lenient either - parseHexNote derives the
  // commitment from the *whole* buffer (buffPedersenHash(buffNote)) while reading the nullifier
  // and secret from the first 62 bytes only, so trailing bytes silently change the commitment and
  // the note would fail to match its own deposit.
  if (!hexNote || hexNote.length !== HEX_NOTE_LENGTH || !isHexStrict(hexNote)) {
    return { isValid: false, errorKey: 'noteIsInvalid' }
  }
  if (netId !== null && Number(noteNetId) !== Number(netId)) {
    return { isValid: false, errorKey: 'changeNetworkNote' }
  }

  return { isValid: true, errorKey: null }
}

// Throws on a malformed note instead of letting it reach parseHexNote, where a missing/short
// hexNote used to surface as an opaque TypeError from .slice() or as a silently truncated
// Buffer.from(..., 'hex') (which ignores trailing non-hex input rather than failing). Callers that
// want to branch on *why* a note is bad should use validateNote directly.
export function parseNote(note) {
  const { isValid, errorKey } = validateNote(note)
  if (!isValid) throw new Error(errorKey)

  const [, currency, amount, netId, hexNote] = note.split('-')

  return {
    ...parseHexNote(hexNote),
    netId,
    amount,
    currency
  }
}

export function parseHexNote(hexNote) {
  const buffNote = Buffer.from(hexNote.slice(2), 'hex')

  const commitment = buffPedersenHash(buffNote)

  const nullifierBuff = buffNote.slice(0, CUT_LENGTH)
  const nullifierHash = BigInt(buffPedersenHash(nullifierBuff))
  const nullifier = BigInt(leInt2Buff(buffNote.slice(0, CUT_LENGTH)))

  const secret = BigInt(leInt2Buff(buffNote.slice(CUT_LENGTH, CUT_LENGTH * 2)))

  return {
    secret,
    nullifier,
    commitment,
    nullifierBuff,
    nullifierHash,
    commitmentHex: toFixedHex(commitment),
    nullifierHex: toFixedHex(nullifierHash)
  }
}

export function leInt2Buff(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  const hex = Buffer.from(bytes).reverse().toString('hex') || '0'
  return BigInt(`0x${hex}`)
}

export function randomBN(nbytes = 31) {
  return leInt2Buff(crypto.randomBytes(nbytes))
}

export function ensurePedersenReady() {
  return pedersen.ready
}

export function buffPedersenHash(buffer) {
  const [hash] = pedersen.unpackPoint(buffer)
  return pedersen.toStringBuffer(hash)
}

export function toFixedHex(value, length = 32) {
  const isBuffer = value instanceof Buffer

  const str = isBuffer ? value.toString('hex') : BigInt(value).toString(16)
  return '0x' + str.padStart(length * 2, '0')
}

export function packEncryptedMessage(encryptedMessage) {
  const nonceBuf = Buffer.from(encryptedMessage.nonce, 'base64')
  const ephemPublicKeyBuf = Buffer.from(encryptedMessage.ephemPublicKey, 'base64')
  const ciphertextBuf = Buffer.from(encryptedMessage.ciphertext, 'base64')
  const messageBuff = Buffer.concat([
    Buffer.alloc(24 - nonceBuf.length),
    nonceBuf,
    Buffer.alloc(32 - ephemPublicKeyBuf.length),
    ephemPublicKeyBuf,
    ciphertextBuf
  ])
  return '0x' + messageBuff.toString('hex')
}

export function unpackEncryptedMessage(encryptedMessage) {
  if (encryptedMessage.slice(0, 2) === '0x') {
    encryptedMessage = encryptedMessage.slice(2)
  }
  const messageBuff = Buffer.from(encryptedMessage, 'hex')
  const nonceBuf = messageBuff.slice(0, 24)
  const ephemPublicKeyBuf = messageBuff.slice(24, 56)
  const ciphertextBuf = messageBuff.slice(56)
  return {
    version: 'x25519-xsalsa20-poly1305',
    nonce: nonceBuf.toString('base64'),
    ephemPublicKey: ephemPublicKeyBuf.toString('base64'),
    ciphertext: ciphertextBuf.toString('base64')
  }
}

export function checkCommitments(events = [], errorMessage = 'failedToFetchAllDepositEvents') {
  events.forEach(({ leafIndex }, i) => {
    if (leafIndex !== i) {
      console.error(`Missing deposit event for deposit #${i}`)
      throw new Error(errorMessage)
    }
  })
}
