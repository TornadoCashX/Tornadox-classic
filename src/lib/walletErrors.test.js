const { UserRejectedRequestError } = require('viem')
const { isUserRejectedRequestError } = require('./walletErrors')

describe('wallet request errors', () => {
  it('recognizes viem user rejection errors', () => {
    expect(isUserRejectedRequestError(new UserRejectedRequestError(new Error('denied')))).toBe(true)
  })

  it.each([4001, '4001', 5000])('recognizes provider rejection code %s', (code) => {
    expect(isUserRejectedRequestError({ code })).toBe(true)
  })

  it('recognizes a rejection wrapped as an error cause', () => {
    expect(isUserRejectedRequestError({ cause: { code: 4001 } })).toBe(true)
  })

  it('does not classify an unrelated wallet failure as a rejection', () => {
    expect(isUserRejectedRequestError(new Error('RPC unavailable'))).toBe(false)
  })
})
