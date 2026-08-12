// pedersen pulls in a real WASM circuit init at module scope; validateNote never touches it, so
// it's stubbed here the same way the other note-related suites do it.
jest.mock('@/services/pedersen', () => ({ pedersen: {} }))

const { checkCommitments, validateNote, parseNote } = require('./crypto')

// A structurally valid note: 'tornado-<currency>-<amount>-<netId>-0x<62 bytes hex>'.
const HEX = `0x${'ab'.repeat(62)}`
const VALID = `tornado-eth-0.1-1-${HEX}`

describe('validateNote', () => {
  it('accepts a well-formed note', () => {
    expect(validateNote(VALID)).toEqual({ isValid: true, errorKey: null })
  })

  // Guards the exact-length rule against drift: services/deposit.js builds the note body as two
  // BN#toBuffer('le', 31) halves, so this is the only length a generated note can ever have.
  it('accepts exactly the length services/deposit.js produces', () => {
    expect(HEX.length).toBe(126)
    expect(validateNote(`tornado-eth-0.1-1-${HEX}`).isValid).toBe(true)
  })

  it.each([
    ['a non-string', 12345],
    ['an empty string', ''],
    ['too few segments', `tornado-eth-0.1-${HEX}`],
    ['too many segments', `tornado-eth-0.1-1-extra-${HEX}`],
    ['a wrong prefix', `notornado-eth-0.1-1-${HEX}`],
    ['a missing currency', `tornado--0.1-1-${HEX}`],
    ['a missing amount', `tornado-eth--1-${HEX}`],
    ['a non-numeric netId', `tornado-eth-0.1-mainnet-${HEX}`],
    ['a truncated hex payload', `tornado-eth-0.1-1-0x${'ab'.repeat(10)}`],
    ['a hex payload one byte short', `tornado-eth-0.1-1-0x${'ab'.repeat(61)}`],
    // Over-long is rejected rather than truncated: parseHexNote hashes the whole buffer for the
    // commitment but reads nullifier/secret from the first 62 bytes, so trailing bytes would
    // yield a commitment that no longer matches the note's own deposit.
    ['a hex payload one byte too long', `tornado-eth-0.1-1-0x${'ab'.repeat(63)}`],
    ['a wildly over-long hex payload', `tornado-eth-0.1-1-0x${'ab'.repeat(124)}`],
    ['a non-hex payload', `tornado-eth-0.1-1-0x${'zz'.repeat(62)}`],
    ['a hex payload missing its 0x', `tornado-eth-0.1-1-${'ab'.repeat(62)}`]
  ])('rejects %s', (_label, note) => {
    expect(validateNote(note)).toEqual({ isValid: false, errorKey: 'noteIsInvalid' })
  })

  it('distinguishes a wrong-chain note from a malformed one', () => {
    expect(validateNote(VALID, 1)).toEqual({ isValid: true, errorKey: null })
    expect(validateNote(VALID, 56)).toEqual({ isValid: false, errorKey: 'changeNetworkNote' })
  })

  it('skips the chain check when no netId is supplied', () => {
    expect(validateNote(`tornado-eth-0.1-999-${HEX}`).isValid).toBe(true)
  })
})

describe('checkCommitments', () => {
  it('throws the caller-provided message without relying on a Nuxt global', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => checkCommitments([{ leafIndex: 1 }], 'missing events')).toThrow('missing events')
    console.error.mockRestore()
  })
})

describe('parseNote', () => {
  // The point of the guard: a malformed note now fails with a named reason instead of reaching
  // parseHexNote and dying on an opaque `.slice()` of undefined.
  it('throws a named error rather than a TypeError on a malformed note', () => {
    expect(() => parseNote('tornado-eth-0.1')).toThrow('noteIsInvalid')
    expect(() => parseNote(`tornado-eth-0.1-1-0xnothex`)).toThrow('noteIsInvalid')
  })
})
