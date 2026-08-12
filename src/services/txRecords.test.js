const {
  buildAddressExplorerUrl,
  buildBlockExplorerUrl,
  buildTornadoWithdrawalRecord,
  buildTxExplorerUrl,
  getTxStatusClass
} = require('./txRecords')

describe('getTxStatusClass', () => {
  it('maps each known tx status to its CSS class', () => {
    expect(getTxStatusClass(1)).toBe('is-loading')
    expect(getTxStatusClass(2)).toBe('is-success')
    expect(getTxStatusClass(3)).toBe('is-danger')
  })

  it('returns undefined for an unknown status', () => {
    expect(getTxStatusClass(0)).toBeUndefined()
    expect(getTxStatusClass(undefined)).toBeUndefined()
  })
})

describe('explorer URL builders', () => {
  const explorerUrl = {
    tx: 'https://explorer.example/tx/',
    address: 'https://explorer.example/address/',
    block: 'https://explorer.example/block/'
  }

  it('builds tx, address, and block explorer URLs', () => {
    expect(buildTxExplorerUrl({ explorerUrl, txHash: '0xabc' })).toBe('https://explorer.example/tx/0xabc')
    expect(buildAddressExplorerUrl({ explorerUrl, address: '0xdef' })).toBe(
      'https://explorer.example/address/0xdef'
    )
    expect(buildBlockExplorerUrl({ explorerUrl, block: 42 })).toBe('https://explorer.example/block/42')
  })
})

describe('buildTornadoWithdrawalRecord', () => {
  // parseNote is injected (as elsewhere in services/) so tests don't need the real
  // pedersen/circomlibjs WASM circuit initialized.
  const hexNote = '0xhexnote'
  const baseParams = {
    note: `tornado-eth-0.1-1-${hexNote}`,
    txHash: '0xwithdrawtx',
    fee: '1000',
    amount: '0.1',
    currency: 'eth',
    netId: 1,
    parseNote: () => ({ commitmentHex: '0xcommitment' })
  }

  it('updates the matching plain deposit record when one exists locally', async () => {
    const getBlockNumber = jest.fn().mockResolvedValue(123)
    const loadDepositEvent = jest.fn()
    const txs = [{ note: hexNote, txHash: '0xdeposittx' }]

    const { mutation, tx } = await buildTornadoWithdrawalRecord({
      ...baseParams,
      encryptedTxs: [],
      txs,
      getBlockNumber,
      loadDepositEvent
    })

    expect(mutation).toBe('UPDATE_DEPOSIT')
    expect(tx).toMatchObject({
      txHash: '0xdeposittx',
      withdrawTxHash: '0xwithdrawtx',
      storeType: 'txs',
      isSpent: true,
      blockNumber: 123
    })
    expect(loadDepositEvent).not.toHaveBeenCalled()
  })

  it('matches an encrypted-note record by commitment ahead of a plain deposit', async () => {
    const getBlockNumber = jest.fn().mockResolvedValue(1)
    const loadDepositEvent = jest.fn()
    const encryptedTxs = [
      { commitmentHex: '0xcommitment', note: 'encrypted-note-value', txHash: '0xencryptedtx' }
    ]

    const { mutation, tx } = await buildTornadoWithdrawalRecord({
      ...baseParams,
      encryptedTxs,
      txs: [],
      getBlockNumber,
      loadDepositEvent
    })

    expect(mutation).toBe('UPDATE_DEPOSIT')
    expect(tx.storeType).toBe('encryptedTxs')
    expect(tx.note).toBe('encrypted-note-value')
    expect(tx.txHash).toBe('0xencryptedtx')
  })

  it('falls back to loading the on-chain deposit event when no local record matches', async () => {
    const getBlockNumber = jest.fn().mockResolvedValue(1)
    const loadDepositEvent = jest.fn().mockResolvedValue({
      txHash: '0xchaindeposittx',
      depositBlock: 999,
      leafIndex: 7
    })

    const { mutation, tx } = await buildTornadoWithdrawalRecord({
      ...baseParams,
      encryptedTxs: [],
      txs: [],
      getBlockNumber,
      loadDepositEvent
    })

    expect(loadDepositEvent).toHaveBeenCalledWith({ withdrawNote: baseParams.note })
    expect(mutation).toBe('SAVE_TX_HASH')
    expect(tx).toMatchObject({
      txHash: '0xchaindeposittx',
      withdrawTxHash: '0xwithdrawtx',
      depositBlock: 999,
      index: 7
    })
  })
})
