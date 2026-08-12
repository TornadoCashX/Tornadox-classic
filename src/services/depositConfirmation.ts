import { findDepositEvent, type EventsInterface } from '@/services/depositLookup'
import type { TxRecord } from '@/services/localTxStore'
import txStatus from '@/store/txStatus'

export const buildConfirmedDepositRecord = async ({
  record,
  blockNumber,
  eventsInterface
}: {
  record: TxRecord
  blockNumber: number
  eventsInterface: EventsInterface
}): Promise<TxRecord> => {
  const confirmed = { ...record, status: txStatus.success, blockNumber }
  if (!record.commitmentHex) return confirmed

  const event = await findDepositEvent({
    eventsInterface,
    note: {
      netId: record.netId,
      amount: record.amount,
      currency: record.currency,
      commitmentHex: String(record.commitmentHex),
      nullifierHex: String(record.nullifierHex || '')
    }
  })

  return event ? { ...confirmed, index: event.leafIndex } : confirmed
}
