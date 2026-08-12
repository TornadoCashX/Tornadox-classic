jest.mock('@/services/deposit', () => ({
  createDepositNote: jest.fn()
}))

jest.mock('@/utils', () => ({
  parseHexNote: jest.fn(() => ({
    nullifierHex: '0xnullifier',
    commitmentHex: '0xcommitment'
  }))
}))

const { executeDepositFlow, parseDepositPrefix, prepareDepositFlow } = require('./depositFlow')

describe('deposit flow service', () => {
  const prefix = 'tornado-eth-0.1-1'

  it('parses and validates a deposit prefix', () => {
    expect(parseDepositPrefix(prefix)).toEqual({ currency: 'eth', amount: '0.1', netId: '1' })
    expect(() => parseDepositPrefix('invalid')).toThrow('Invalid deposit prefix')
  })

  it('prepares a note and schedules its backup after note generation is ready', async () => {
    const scheduleBackup = jest.fn()
    const createNote = jest.fn(async () => ({ note: '0xnote', commitmentHex: '0xcommitment' }))

    await expect(
      prepareDepositFlow({ prefix, contractAddress: '0xproxy', scheduleBackup, createNote })
    ).resolves.toEqual({
      prefix,
      note: '0xnote',
      commitment: '0xcommitment'
    })
    expect(scheduleBackup).toHaveBeenCalledWith({ prefix, note: '0xnote' })
  })

  it('encodes, estimates, sends and records a native deposit', async () => {
    const getGasLimit = jest.fn().mockResolvedValue(100000)
    const sendTransaction = jest.fn().mockResolvedValue('0xtxhash')
    const proxyAddress = '0x1111111111111111111111111111111111111111'
    const instanceAddress = '0x2222222222222222222222222222222222222222'
    const commitment = `0x${'ab'.repeat(32)}`

    const record = await executeDepositFlow({
      commitment,
      note: '0xnote',
      prefix,
      isEncrypted: false,
      network: { tokens: { eth: { decimals: 18, instanceAddress: { '0.1': instanceAddress } } } },
      contractAddress: proxyAddress,
      account: '0xaccount',
      nativeCurrency: 'eth',
      encryptedAccounts: {},
      getEncryptedNote: jest.fn(),
      getGasLimit,
      sendTransaction,
      now: () => 123
    })

    expect(getGasLimit).toHaveBeenCalledWith(
      expect.objectContaining({ from: '0xaccount', to: proxyAddress, data: expect.stringMatching(/^0x/) }),
      'other',
      10
    )
    expect(sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ from: '0xaccount', to: proxyAddress, data: expect.stringMatching(/^0x/) })
    )
    expect(sendTransaction).toHaveBeenCalledTimes(1)
    expect(record).toMatchObject({
      txHash: '0xtxhash',
      type: 'Deposit',
      timestamp: 123,
      storeType: 'txs',
      nullifierHex: '0xnullifier',
      commitmentHex: '0xcommitment'
    })
    expect(record.index).toBeUndefined()
  })

  it('uses the encrypted note in the transaction and persisted record', async () => {
    const proxyAddress = '0x1111111111111111111111111111111111111111'
    const instanceAddress = '0x2222222222222222222222222222222222222222'

    const record = await executeDepositFlow({
      commitment: `0x${'ab'.repeat(32)}`,
      note: '0xnote',
      prefix,
      isEncrypted: true,
      network: { tokens: { eth: { decimals: 18, instanceAddress: { '0.1': instanceAddress } } } },
      contractAddress: proxyAddress,
      account: '0xaccount',
      nativeCurrency: 'eth',
      encryptedAccounts: {},
      getEncryptedNote: jest.fn().mockResolvedValue('0xabcd'),
      getGasLimit: jest.fn().mockResolvedValue(100000),
      sendTransaction: jest.fn().mockResolvedValue('0xtxhash')
    })

    expect(record).toMatchObject({
      note: '0xabcd',
      storeType: 'encryptedTxs',
      owner: '',
      backupAccount: ''
    })
  })
})
