const { createDepositNote } = require('./deposit')

describe('deposit note generation', () => {
  it('waits for Pedersen initialization and creates a canonical 62-byte note', async () => {
    const deposit = await createDepositNote()

    expect(deposit.note).toMatch(/^0x[0-9a-f]{124}$/)
    expect(deposit.commitmentHex).toMatch(/^0x[0-9a-f]{64}$/)
    expect(deposit.nullifier).toBeLessThan(1n << (31n * 8n))
    expect(deposit.secret).toBeLessThan(1n << (31n * 8n))
  })
})
