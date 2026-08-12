import { UserRejectedRequestError } from 'viem'

const USER_REJECTION_CODES = new Set([4001, 5000])

export const isUserRejectedRequestError = (error: unknown): boolean => {
  const visited = new Set<unknown>()
  let current = error

  while (current && typeof current === 'object' && !visited.has(current)) {
    if (
      current instanceof UserRejectedRequestError ||
      (current as { name?: unknown }).name === 'UserRejectedRequestError' ||
      USER_REJECTION_CODES.has(Number((current as { code?: unknown }).code))
    ) {
      return true
    }

    visited.add(current)
    current = (current as { cause?: unknown }).cause
  }

  return false
}
