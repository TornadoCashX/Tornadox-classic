jest.mock('@/utils/crypto', () => ({
  toFixedHex: (value, length = 32) =>
    `0x${BigInt(value)
      .toString(16)
      .padStart(length * 2, '0')}`
}))

const { buildRelayerWithdrawalTx, buildWithdrawalArgs, buildWithdrawalInput } = require('./withdrawal')

describe('withdrawal protocol service', () => {
  it('builds Tornado withdrawal public and private inputs', () => {
    const input = buildWithdrawalInput({
      fee: 3,
      root: 1,
      refund: 4,
      relayer: 5,
      recipient: 6,
      note: {
        nullifierHash: 2,
        secret: 7,
        nullifier: 8
      },
      pathElements: [9, 10],
      pathIndices: [0, 1]
    })

    expect(input).toEqual({
      fee: 3n,
      root: 1,
      refund: 4n,
      relayer: 5n,
      recipient: 6n,
      nullifierHash: 2,
      secret: 7,
      nullifier: 8,
      pathElements: [9, 10],
      pathIndices: [0, 1]
    })
  })

  it('formats Solidity withdrawal args', () => {
    const args = buildWithdrawalArgs({
      root: 1,
      nullifierHash: 2,
      recipient: 3,
      relayer: 4,
      fee: 5,
      refund: 6
    })

    expect(args).toEqual([
      `0x${'0'.repeat(63)}1`,
      `0x${'0'.repeat(63)}2`,
      `0x${'0'.repeat(39)}3`,
      `0x${'0'.repeat(39)}4`,
      `0x${'0'.repeat(63)}5`,
      `0x${'0'.repeat(63)}6`
    ])
  })

  it('builds relayer withdrawal transaction data', () => {
    const tornadoProxyAddress = '0x1111111111111111111111111111111111111111'
    const tornadoInstanceAddress = '0x2222222222222222222222222222222222222222'

    const tx = buildRelayerWithdrawalTx({
      tornadoProxyAddress,
      tornadoInstanceAddress,
      proof: '0x1234',
      withdrawCallArgs: [
        `0x${'aa'.repeat(32)}`,
        `0x${'bb'.repeat(32)}`,
        '0x3333333333333333333333333333333333333333',
        '0x0000000000000000000000000000000000000000',
        '0',
        '0'
      ]
    })

    expect(tx).toEqual({
      to: tornadoProxyAddress,
      data: expect.stringMatching(/^0x/),
      value: '0'
    })
  })
})
