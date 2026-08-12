// Framework-independent deposit/withdrawal note lookup + wei<->decimal formatting.
// Ports the read-only pieces of store/application.js's loadDepositEvent/loadWithdrawalEvent/
// loadWithdrawalData and store/token.js's toDecimals/fromDecimals getters (dropping their Vuex
// `rootState.application.selectedStatistic` currency-defaulting, since every caller here already
// knows its currency/decimals) so both the Nuxt app and web-react can share one implementation.
import { formatUnits, parseUnits } from 'viem'

import { eventsType } from '@/constants'

export interface FoundEvent {
  timestamp: number
  leafIndex: number
  transactionHash: string
  blockNumber: number
  to?: string
  fee?: string
}

export interface EventsService {
  findEvent(params: { eventName: string; eventToFind: string; type: string }): Promise<FoundEvent | undefined>
  updateEvents(type: string): Promise<unknown>
}

export interface EventsInterface {
  getService(params: { netId: string | number; amount: string | number; currency: string }): EventsService
}

export interface NoteIdentity {
  netId: string | number
  amount: string | number
  currency: string
  commitmentHex: string
  nullifierHex: string
}

export const findDepositEvent = ({
  eventsInterface,
  note
}: {
  eventsInterface: EventsInterface
  note: NoteIdentity
}): Promise<FoundEvent | undefined> => {
  return eventsInterface
    .getService(note)
    .findEvent({ eventName: 'commitment', eventToFind: note.commitmentHex, type: eventsType.DEPOSIT })
}

export const findWithdrawalEvent = ({
  eventsInterface,
  note
}: {
  eventsInterface: EventsInterface
  note: NoteIdentity
}): Promise<FoundEvent | undefined> => {
  return eventsInterface
    .getService(note)
    .findEvent({ eventName: 'nullifierHash', eventToFind: note.nullifierHex, type: eventsType.WITHDRAWAL })
}

export const isNullifierSpent = async ({
  eventsInterface,
  note
}: {
  eventsInterface: EventsInterface
  note: NoteIdentity
}): Promise<boolean> => {
  return Boolean(await findWithdrawalEvent({ eventsInterface, note }))
}

// Formats a base-unit (wei-like) integer amount into a human decimal string. Mirrors web3's fromWei.
export const toDecimals = (
  rawValue: number | string | bigint,
  decimals: number,
  fixed = 2
): string => {
  const formatted = formatUnits(BigInt(rawValue), decimals)
  if (!fixed || !formatted.includes('.')) return formatted
  const [whole, fraction] = formatted.split('.')
  const truncated = fraction.slice(0, fixed).replace(/0+$/, '')
  return truncated ? `${whole}.${truncated}` : whole
}

// Parses a human decimal string into base units. viem validates the numeric representation.
export const fromDecimals = (rawValue: string | number, decimals: number): bigint => {
  const value = rawValue.toString()
  if (value === '.' || value === '-.') {
    throw new Error(`Invalid decimal value: ${value}`)
  }
  const comps = value.replace(/^-/, '').split('.')
  if (comps.length > 2) {
    throw new Error(`Too many decimal points: ${value}`)
  }
  if ((comps[1]?.length || 0) > decimals) {
    throw new Error(`Too many decimal places: ${value}`)
  }
  return parseUnits(value, decimals)
}

export interface WithdrawalReport {
  to?: string
  txHash: string
  withdrawalBlock: number
  fee: string
  amount: string
}

export const buildWithdrawalReport = ({
  event,
  amount,
  decimals
}: {
  event: FoundEvent
  amount: string | number
  decimals: number
}): WithdrawalReport => {
  const fee = event.fee ?? '0'
  const withdrawalAmount = fromDecimals(amount.toString(), decimals) - BigInt(fee)

  return {
    to: event.to,
    txHash: event.transactionHash,
    withdrawalBlock: event.blockNumber,
    fee: toDecimals(fee, decimals, 4),
    amount: toDecimals(withdrawalAmount, decimals, 4)
  }
}
