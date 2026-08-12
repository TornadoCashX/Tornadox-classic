jest.mock('@/services/proof', () => ({
  buildProofInputFromTree: jest.fn((input) => input),
  generateWithdrawalProof: jest.fn()
}))

const {
  createWithdrawalProofFlow,
  prepareWithdrawalFlow
} = require('./withdrawFlow')

describe('withdraw flow service', () => {
  const withdrawArgs = ['root', 'nullifier', 'recipient', 'relayer', 'fee', 'refund']
  const tree = {
    path: jest.fn(() => ({ pathElements: [1, 2], pathIndices: [0, 1] })),
    indexOf: jest.fn(() => 3)
  }
  const note = {
    netId: '11155111',
    amount: '0.1',
    currency: 'eth',
    commitmentHex: '0xcommitment',
    nullifierHash: 1,
    nullifier: 2,
    secret: 3
  }

  it('requires a relayer before proof generation', async () => {
    const generateProof = jest.fn().mockResolvedValue({ proof: '0xproof', args: withdrawArgs })

    await expect(
      createWithdrawalProofFlow({
        root: 4,
        note,
        tree,
        recipient: 5,
        leafIndex: 3,
        nativeCurrency: 'eth',
        selectedRelayer: null,
        getRelayerFee: jest.fn(),
        ethToReceive: '0',
        buildRelayerTransaction: jest.fn(),
        calculateRelayerFee: jest.fn(),
        generateProof
      })
    ).rejects.toThrow('Relayer address is required')

    expect(generateProof).not.toHaveBeenCalled()
  })

  it('recalculates a sidechain relayer proof with the encoded transaction fee', async () => {
    const generateProof = jest
      .fn()
      .mockResolvedValueOnce({ proof: '0xdummy', args: withdrawArgs })
      .mockResolvedValueOnce({ proof: '0xfinal', args: withdrawArgs })
    let fee = '10'
    const calculateRelayerFee = jest.fn().mockImplementation(() => {
      fee = '20'
    })
    const buildRelayerTransaction = jest.fn(() => ({ to: '0xproxy', data: '0xdata' }))

    await expect(
      createWithdrawalProofFlow({
        root: 4,
        note,
        tree,
        recipient: 5,
        leafIndex: 3,
        nativeCurrency: 'eth',
        selectedRelayer: { address: '0x0000000000000000000000000000000000000001' },
        getRelayerFee: () => fee,
        ethToReceive: '0',
        buildRelayerTransaction,
        calculateRelayerFee,
        generateProof
      })
    ).resolves.toEqual({ proof: '0xfinal', args: withdrawArgs })

    expect(buildRelayerTransaction).toHaveBeenCalledWith({
      proof: '0xdummy',
      withdrawCallArgs: withdrawArgs,
      amount: '0.1',
      currency: 'eth'
    })
    expect(calculateRelayerFee).toHaveBeenCalledTimes(1)
    expect(generateProof.mock.calls[1][0]).toMatchObject({ fee: 20n })
  })

  it('includes token refund and prechecked fee in a mainnet relayer proof', async () => {
    const generateProof = jest.fn().mockResolvedValue({ proof: '0xproof', args: withdrawArgs })
    const tokenNote = { ...note, netId: '1', currency: 'dai', amount: '100' }

    await createWithdrawalProofFlow({
      root: 4,
      note: tokenNote,
      tree,
      recipient: 5,
      leafIndex: 3,
      nativeCurrency: 'eth',
      selectedRelayer: { address: '0x0000000000000000000000000000000000000001' },
      getRelayerFee: () => '10',
      ethToReceive: '20',
      buildRelayerTransaction: jest.fn(),
      calculateRelayerFee: jest.fn(),
      generateProof
    })

    expect(generateProof).toHaveBeenCalledTimes(1)
    expect(generateProof.mock.calls[0][0]).toMatchObject({ fee: 10n, refund: 20n })
  })

  it('does not generate a second proof when the exact relayer fee is rejected', async () => {
    const generateProof = jest.fn().mockResolvedValue({ proof: '0xproof', args: withdrawArgs })

    await expect(
      createWithdrawalProofFlow({
        root: 4,
        note,
        tree,
        recipient: 5,
        leafIndex: 3,
        nativeCurrency: 'eth',
        selectedRelayer: { address: '0x0000000000000000000000000000000000000001' },
        getRelayerFee: () => '0',
        ethToReceive: '0',
        buildRelayerTransaction: jest.fn(() => ({ data: '0xdata' })),
        calculateRelayerFee: jest.fn().mockRejectedValue(new Error('fee exceeds denomination')),
        generateProof
      })
    ).rejects.toThrow('fee exceeds denomination')

    expect(generateProof).toHaveBeenCalledTimes(1)
  })

  it('rejects spent notes before proof generation', async () => {
    const createProof = jest.fn()
    const buildTree = jest.fn().mockResolvedValue({ tree, root: '0xroot' })

    await expect(
      prepareWithdrawalFlow({
        serializedNote: 'note',
        recipient: '0xrecipient',
        parseNote: () => note,
        buildTree,
        isSpent: jest.fn().mockResolvedValue(true),
        createProof,
        spentMessage: 'spent',
        missingDepositMessage: 'missing'
      })
    ).rejects.toThrow('spent')
    expect(buildTree).not.toHaveBeenCalled()
    expect(createProof).not.toHaveBeenCalled()
  })
})
