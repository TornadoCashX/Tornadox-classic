export const TransactionType = Object.freeze({
  DEPOSIT: 'Deposit',
  WITHDRAWAL: 'Withdrawal'
} as const)
export type TransactionType = typeof TransactionType[keyof typeof TransactionType]

export const normalizeChainId = (chainId: string | number): number => {
  const normalized =
    typeof chainId === 'string' && chainId.startsWith('0x') ? Number(BigInt(chainId)) : Number(chainId)

  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new Error('Invalid chain id')
  }

  return normalized
}
