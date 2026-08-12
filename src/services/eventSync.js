export function createBlockRanges({
  batchStart,
  batchIndex,
  batchSize,
  blockDenom,
  batchDigest,
  currentBlockNumber,
  type
}) {
  const requestCount = Math.min(batchSize, batchDigest - batchIndex * batchSize)

  return new Array(requestCount).fill('').map((_, index) => {
    const segmentIndex = batchIndex * batchSize + index
    const fromBlock = batchStart + index * blockDenom
    const toBlock =
      segmentIndex === batchDigest - 1
        ? currentBlockNumber
        : Math.min(fromBlock + blockDenom - 1, currentBlockNumber)

    return { fromBlock, toBlock, type }
  })
}

export function getPersistedEventCursor(lastEvent, savedEvents) {
  return lastEvent?.blockNumber ?? savedEvents[savedEvents.length - 1]?.blockNumber ?? ''
}

export function getNextSyncBlock(indexedBlock, lastEvent) {
  const blocks = [indexedBlock, lastEvent?.blockNumber].map(Number).filter(Number.isFinite)
  return blocks.length ? Math.max(...blocks) + 1 : ''
}

export function clampEventCursor(cursor, chainHead) {
  const cursorNumber = Number(cursor)
  const chainHeadNumber = Number(chainHead)

  if (!Number.isFinite(chainHeadNumber)) return cursor
  if (!Number.isFinite(cursorNumber)) return chainHeadNumber

  return Math.min(cursorNumber, chainHeadNumber)
}

export function splitGraphPage(events, fromBlock, pageSize = 1000) {
  if (!Array.isArray(events) || !events.length) {
    return { events: [], isComplete: true, nextBlock: null }
  }

  if (events.length < pageSize) {
    return { events, isComplete: true, nextBlock: null }
  }

  const nextBlock = Number(events[events.length - 1].blockNumber)
  const currentBlock = Number(fromBlock)
  const completeEvents = events.filter((event) => Number(event.blockNumber) < nextBlock)

  if (
    !Number.isFinite(nextBlock) ||
    (Number.isFinite(currentBlock) && nextBlock <= currentBlock) ||
    !completeEvents.length
  ) {
    throw new Error('Graph pagination did not advance')
  }

  return { events: completeEvents, isComplete: false, nextBlock }
}

export function mergeEventStreams(...streams) {
  const events = streams.flat().filter(Boolean)
  const seen = new Set()

  return events.filter((event) => {
    const identity = [
      event.transactionHash || '',
      event.commitment || event.nullifierHash || '',
      event.leafIndex ?? '',
      event.blockNumber ?? ''
    ].join(':')

    if (seen.has(identity)) return false
    seen.add(identity)
    return true
  })
}
