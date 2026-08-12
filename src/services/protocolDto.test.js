const {
  createDepositIntentDTO,
  createDepositRecordDTO,
  createPoolDTO,
  createRelayerWithdrawRequestDTO,
  createSerializedNoteDTO,
  createTransactionRequestDTO,
  createWithdrawalProofDTO
} = require('./protocolDto')

describe('protocol DTOs', () => {
  const args = ['root', 'nullifier', 'recipient', 'relayer', 'fee', 'refund']

  it('normalizes deposit intents and pool identity', () => {
    const intent = createDepositIntentDTO('tornado-eth-0.1-11155111')
    const pool = createPoolDTO({
      ...intent,
      network: {
        tokens: {
          eth: { decimals: 18, instanceAddress: { '0.1': '0xinstance' } }
        }
      }
    })

    expect(intent).toEqual({
      amount: '0.1',
      currency: 'eth',
      netId: '11155111',
      prefix: 'tornado-eth-0.1-11155111'
    })
    expect(pool).toMatchObject({ chainId: 11155111, instanceAddress: '0xinstance', decimals: 18 })
  })

  it('rejects malformed chain, pool and withdrawal data', () => {
    expect(() => createDepositIntentDTO('not-a-note')).toThrow('Invalid deposit prefix')
    expect(() => createDepositIntentDTO('tornado-eth-0.1-1-extra')).toThrow('Invalid deposit prefix')
    expect(() => createDepositIntentDTO('tornado-eth-0.1-invalid')).toThrow('Invalid chain id')
    expect(() =>
      createPoolDTO({ network: { tokens: {} }, netId: 1, currency: 'eth', amount: '0.1' })
    ).toThrow('Pool is not supported')
    expect(() => createWithdrawalProofDTO({ proof: '0xproof', args: [] })).toThrow(
      'Withdrawal arguments must contain 6 values'
    )
    expect(() =>
      createPoolDTO({
        network: { tokens: { eth: { decimals: 'invalid', instanceAddress: { '0.1': '0xpool' } } } },
        netId: 1,
        currency: 'eth',
        amount: '0.1'
      })
    ).toThrow('Token decimals must be a non-negative integer')
    expect(() =>
      createTransactionRequestDTO({ from: '0xfrom', to: '0xto', data: '0xdata', value: '' })
    ).toThrow('Transaction value is required')
    expect(() => createSerializedNoteDTO('tornado-eth-0.1-1-invalid')).toThrow('Invalid withdrawal note')
  })

  it('normalizes complete serialized withdrawal notes', () => {
    const serializedNote = `tornado-eth-0.1-1-0x${'1'.repeat(124)}`
    expect(createSerializedNoteDTO(serializedNote)).toMatchObject({
      amount: '0.1',
      currency: 'eth',
      netId: '1'
    })
  })

  it('creates stable transaction, proof and relayer DTOs', () => {
    expect(createTransactionRequestDTO({ from: '0xfrom', to: '0xto', data: '0xdata' })).toEqual({
      from: '0xfrom',
      to: '0xto',
      data: '0xdata',
      value: '0x00'
    })
    expect(createWithdrawalProofDTO({ proof: '0xproof', args })).toEqual({ proof: '0xproof', args })
    expect(createRelayerWithdrawRequestDTO({ proof: '0xproof', args, contract: '0xpool' })).toEqual({
      proof: '0xproof',
      args,
      contract: '0xpool'
    })
  })

  it('creates a normalized deposit persistence record', () => {
    expect(
      createDepositRecordDTO({
        txHash: '0xtx',
        note: '0xnote',
        amount: '0.1',
        storeType: 'txs',
        prefix: 'tornado-eth-0.1-1',
        netId: '0x1',
        timestamp: 10,
        index: '3',
        nullifierHex: '0xnullifier',
        commitmentHex: '0xcommitment',
        currency: 'eth'
      })
    ).toMatchObject({ netId: '1', index: 3, type: 'Deposit' })
  })

  it('rejects invalid deposit persistence counters', () => {
    const baseRecord = {
      txHash: '0xtx',
      note: '0xnote',
      amount: '0.1',
      storeType: 'txs',
      prefix: 'tornado-eth-0.1-1',
      netId: 1,
      timestamp: 10,
      index: 3,
      nullifierHex: '0xnullifier',
      commitmentHex: '0xcommitment',
      currency: 'eth'
    }

    expect(() => createDepositRecordDTO({ ...baseRecord, index: -1 })).toThrow(
      'Deposit index must be a non-negative integer'
    )
    expect(() => createDepositRecordDTO({ ...baseRecord, timestamp: Number.NaN })).toThrow(
      'Deposit timestamp must be a non-negative integer'
    )
  })
})
