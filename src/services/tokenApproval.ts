export interface TokenPoolSelection {
  netId: number
  currency: string
  amount: number
  account: string
}

export const isSameTokenPoolSelection = (left: TokenPoolSelection, right: TokenPoolSelection) =>
  left.netId === right.netId &&
  left.currency === right.currency &&
  left.amount === right.amount &&
  left.account.toLowerCase() === right.account.toLowerCase()

// Tether's legacy USDT contract rejects changing a non-zero allowance directly to another
// non-zero value. Only that configured token needs the preliminary reset; other pools keep the
// normal single-transaction approval path.
export const getTokenApprovalSequence = ({
  currency,
  currentAllowance,
  targetAllowance
}: {
  currency: string
  currentAllowance: bigint
  targetAllowance: bigint
}): bigint[] => {
  if (currency.toLowerCase() === 'usdt' && currentAllowance > 0n && targetAllowance > 0n) {
    return [0n, targetAllowance]
  }
  return [targetAllowance]
}
