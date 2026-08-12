const mockDecrypt = jest.fn()
const mockGetInstanceByAddress = jest.fn()
const mockParseHexNote = jest.fn()
const mockUnpackEncryptedMessage = jest.fn((encryptedNote) => encryptedNote)

jest.mock('eth-sig-util', () => ({ decrypt: (...args) => mockDecrypt(...args) }))
jest.mock('@/utils', () => ({
  getInstanceByAddress: (...args) => mockGetInstanceByAddress(...args),
  parseHexNote: (...args) => mockParseHexNote(...args),
  unpackEncryptedMessage: (...args) => mockUnpackEncryptedMessage(...args)
}))

const {
  decryptAndFormatEncryptedNoteEvents,
  decryptEncryptedNoteEvents,
  groupEventsIntoBatches,
  summarizeDecryptedTransactions
} = require('./accountNoteDecryptFlow')
const { eventsType } = require('@/constants')

afterEach(() => {
  jest.clearAllMocks()
})

describe('decryptEncryptedNoteEvents', () => {
  it('decrypts each event and skips ones that fail (foreign notes)', () => {
    mockDecrypt.mockReturnValueOnce('0xaddr1-note1').mockImplementationOnce(() => {
      throw new Error('bad ciphertext')
    })
    const events = [
      { encryptedNote: 'enc1', txHash: '0xa' },
      { encryptedNote: 'enc2', txHash: '0xb' }
    ]

    const result = decryptEncryptedNoteEvents({ events, privateKey: 'pk' })

    expect(result).toEqual([{ address: '0xaddr1', note: 'note1', encryptedNote: 'enc1', txHash: '0xa' }])
  })
})

describe('summarizeDecryptedTransactions', () => {
  it('counts unspent deposits and collects their statistic entries, dropping falsy entries', () => {
    const transactions = [
      { isSpent: false, amount: '0.1', currency: 'eth' },
      { isSpent: true, amount: '1', currency: 'eth' },
      undefined
    ]

    expect(summarizeDecryptedTransactions(transactions)).toEqual({
      unSpent: 1,
      statistic: [{ amount: '0.1', currency: 'eth' }],
      transactions: [
        { isSpent: false, amount: '0.1', currency: 'eth' },
        { isSpent: true, amount: '1', currency: 'eth' }
      ]
    })
  })
})

describe('groupEventsIntoBatches', () => {
  it('splits events into batches of the given size without mutating the input', () => {
    const events = Array.from({ length: 5 }, (_, i) => i)
    const original = [...events]

    const batches = groupEventsIntoBatches(events, 2)

    expect(batches).toEqual([[0, 1], [2, 3], [4]])
    expect(events).toEqual(original)
  })
})

describe('decryptAndFormatEncryptedNoteEvents', () => {
  it('decrypts, groups by pool instance, syncs events, and matches deposit/withdrawal state', async () => {
    mockDecrypt.mockReturnValue('0xpool-hexnote')
    mockGetInstanceByAddress.mockReturnValue({ currency: 'eth', amount: '0.1' })
    mockParseHexNote.mockReturnValue({ commitmentHex: '0xcommitment', nullifierHex: '0xnullifier' })

    const updateEvents = jest.fn().mockResolvedValue()
    const findEvent = jest
      .fn()
      .mockResolvedValueOnce({ leafIndex: 1, timestamp: 111, transactionHash: '0xdeposittx', blockNumber: 5 })
      .mockResolvedValueOnce(false)
    const getEventsService = jest.fn(() => ({ updateEvents, findEvent }))
    const loadWithdrawalEvent = jest.fn()
    const onBeforeDepositMatching = jest.fn()
    const onBeforeWithdrawalMatching = jest.fn()

    const result = await decryptAndFormatEncryptedNoteEvents({
      events: [{ encryptedNote: 'enc1', txHash: '0xwithdrawtx', blockNumber: 9 }],
      privateKey: 'pk',
      netId: 1,
      accounts: { encrypt: '0xEncryptAddress', backup: '' },
      getEventsService,
      loadWithdrawalEvent,
      onBeforeDepositMatching,
      onBeforeWithdrawalMatching
    })

    expect(onBeforeDepositMatching).toHaveBeenCalledTimes(1)
    expect(onBeforeWithdrawalMatching).toHaveBeenCalledTimes(1)
    expect(updateEvents).toHaveBeenCalledTimes(2)
    expect(loadWithdrawalEvent).not.toHaveBeenCalled()
    expect(result.unSpent).toBe(1)
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0]).toMatchObject({
      isSpent: false,
      currency: 'eth',
      amount: '0.1',
      storeType: 'encryptedTxs'
    })
  })

  it('skips events whose deposit instance address is unknown', async () => {
    mockDecrypt.mockReturnValue('0xunknownpool-hexnote')
    mockGetInstanceByAddress.mockReturnValue(null)
    const getEventsService = jest.fn()

    const result = await decryptAndFormatEncryptedNoteEvents({
      events: [{ encryptedNote: 'enc1', txHash: '0xtx' }],
      privateKey: 'pk',
      netId: 1,
      accounts: { encrypt: '', backup: '' },
      getEventsService,
      loadWithdrawalEvent: jest.fn()
    })

    // No known pool instance matched the decrypted event, so nothing to sync or format.
    expect(getEventsService).not.toHaveBeenCalled()
    expect(result).toEqual({ unSpent: 0, statistic: [], transactions: [] })
  })

  it('keeps matched events in a batch when another event in the same batch has no matching instance', async () => {
    mockDecrypt
      .mockReturnValueOnce('0xknownpool-hexnote1')
      .mockReturnValueOnce('0xunknownpool-hexnote2')
      .mockReturnValueOnce('0xknownpool-hexnote3')
    mockGetInstanceByAddress.mockImplementation(({ address }) =>
      address === '0xknownpool' ? { currency: 'eth', amount: '0.1' } : null
    )
    mockParseHexNote.mockReturnValue({ commitmentHex: '0xcommitment', nullifierHex: '0xnullifier' })

    const updateEvents = jest.fn().mockResolvedValue()
    const findEvent = jest
      .fn()
      .mockImplementation(({ type }) =>
        type === eventsType.DEPOSIT
          ? { leafIndex: 1, timestamp: 111, transactionHash: '0xdeposittx', blockNumber: 5 }
          : false
      )
    const getEventsService = jest.fn(() => ({ updateEvents, findEvent }))

    // Same batch (< DEFAULT_BATCH_SIZE) mixes two events that resolve to a known
    // pool instance with one whose decrypted address matches no configured instance.
    const result = await decryptAndFormatEncryptedNoteEvents({
      events: [
        { encryptedNote: 'enc1', txHash: '0xtx1', blockNumber: 9 },
        { encryptedNote: 'enc2', txHash: '0xtx2', blockNumber: 10 },
        { encryptedNote: 'enc3', txHash: '0xtx3', blockNumber: 11 }
      ],
      privateKey: 'pk',
      netId: 1,
      accounts: { encrypt: '', backup: '' },
      getEventsService,
      loadWithdrawalEvent: jest.fn()
    })

    // The unmatched event must not cause the whole batch to be dropped.
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions.map((tx) => tx.txHash)).toEqual(['0xtx1', '0xtx3'])
  })
})
