import { eventsType } from '@/constants'

const getEventArgs = (event) => event?.args || event?.returnValues || event || {}

const isFiniteNumber = (value) => Number.isFinite(Number(value))

export function normalizeEvent(event, type) {
  const args = getEventArgs(event)
  const blockNumber = Number(event?.blockNumber)
  const transactionHash = event?.transactionHash

  if (!isFiniteNumber(blockNumber) || !transactionHash) return null

  if (type === eventsType.DEPOSIT) {
    const commitment = args.commitment ?? event.commitment
    const leafIndex = Number(args.leafIndex ?? event.leafIndex)
    const timestamp = Number(args.timestamp ?? event.timestamp)

    if (!commitment || !isFiniteNumber(leafIndex) || !isFiniteNumber(timestamp)) return null

    return {
      blockNumber,
      transactionHash,
      commitment,
      leafIndex,
      timestamp
    }
  }

  const nullifierHash = args.nullifierHash ?? event.nullifierHash
  if (!nullifierHash) return null

  return {
    blockNumber,
    transactionHash,
    nullifierHash,
    to: args.to ?? event.to,
    fee: args.fee ?? event.fee
  }
}

export function formatEvents(events, type) {
  return events.map((event) => normalizeEvent(event, type)).filter(Boolean)
}
