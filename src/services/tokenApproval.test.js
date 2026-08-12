const { getTokenApprovalSequence, isSameTokenPoolSelection } = require('./tokenApproval')

describe('token approval service', () => {
  it('uses one approval for a normal ERC20 token', () => {
    expect(
      getTokenApprovalSequence({ currency: 'dai', currentAllowance: 1n, targetAllowance: 100n })
    ).toEqual([100n])
  })

  it('resets a non-zero USDT allowance before setting a new value', () => {
    expect(
      getTokenApprovalSequence({ currency: 'usdt', currentAllowance: 1n, targetAllowance: 100n })
    ).toEqual([0n, 100n])
  })

  it('does not add a redundant USDT reset when allowance is already zero', () => {
    expect(
      getTokenApprovalSequence({ currency: 'usdt', currentAllowance: 0n, targetAllowance: 100n })
    ).toEqual([100n])
  })

  it('binds a request to its chain, pool and account', () => {
    const request = { netId: 1, currency: 'dai', amount: 100, account: '0xABC' }
    expect(isSameTokenPoolSelection(request, { ...request, account: '0xabc' })).toBe(true)
    expect(isSameTokenPoolSelection(request, { ...request, netId: 11155111 })).toBe(false)
    expect(isSameTokenPoolSelection(request, { ...request, amount: 1000 })).toBe(false)
  })
})
