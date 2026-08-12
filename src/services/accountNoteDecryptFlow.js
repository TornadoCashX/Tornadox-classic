import { decrypt } from 'eth-sig-util'
import { isAddress } from 'viem'

import { eventsType } from '@/constants'
import { parseHexNote, getInstanceByAddress, unpackEncryptedMessage } from '@/utils'

const DEFAULT_BATCH_SIZE = 100

export const decryptEncryptedNoteEvents = ({ events, privateKey }) => {
  const decryptedEvents = []

  for (const event of events) {
    try {
      const unpackedMessage = unpackEncryptedMessage(event.encryptedNote)
      const [address, note] = decrypt(unpackedMessage, privateKey).split('-')
      decryptedEvents.push({ address, note, ...event })
    } catch {
      // decryption may fail for foreign notes
      continue
    }
  }

  return decryptedEvents
}

export const summarizeDecryptedTransactions = (transactions) => {
  const result = []
  const statistic = []
  let unSpent = 0

  transactions.forEach((transaction) => {
    if (transaction) {
      if (!transaction.isSpent) {
        unSpent += 1
        statistic.push({
          amount: transaction.amount,
          currency: transaction.currency
        })
      }

      result.push(transaction)
    }
  })

  return { unSpent, statistic, transactions: result }
}

export const groupEventsIntoBatches = (events, batchSize = DEFAULT_BATCH_SIZE) => {
  const remaining = [...events]
  const batches = []

  while (remaining.length) {
    batches.push(remaining.splice(0, batchSize))
  }

  return batches
}

const loadDepositForEvent = async ({ netId, event, service, instance }) => {
  const { commitmentHex, nullifierHex } = parseHexNote(event.note)

  const foundEvent = await service.findEvent({
    eventName: 'commitment',
    eventToFind: commitmentHex,
    type: eventsType.DEPOSIT
  })

  if (!foundEvent) {
    return
  }

  const isSpent = await service.findEvent({
    eventName: 'nullifierHash',
    eventToFind: nullifierHex,
    type: eventsType.WITHDRAWAL
  })

  return [
    event,
    {
      nullifierHex,
      commitmentHex,
      amount: instance.amount,
      isSpent: Boolean(isSpent),
      currency: instance.currency,
      prefix: `tornado-${instance.currency}-${instance.amount}-${netId}`,
      leafIndex: foundEvent.leafIndex,
      timestamp: foundEvent.timestamp,
      txHash: foundEvent.transactionHash,
      depositBlock: foundEvent.blockNumber
    }
  ]
}

const buildEncryptedTransaction = async ({
  deposit,
  netId,
  event: { note, address, ...event },
  accounts,
  loadWithdrawalEvent
}) => {
  const { encrypt, backup } = accounts

  try {
    const { depositBlock, ...rest } = deposit

    const transaction = {
      ...rest,
      netId,
      status: 2,
      type: 'Deposit',
      txHash: event.txHash,
      owner: isAddress(encrypt) ? encrypt : '',
      backupAccount: isAddress(backup) ? backup : '',
      index: deposit.leafIndex,
      storeType: 'encryptedTxs',
      blockNumber: event.blockNumber,
      note: event.encryptedNote
    }

    if (deposit && deposit.isSpent) {
      const withdrawEvent = await loadWithdrawalEvent({ withdrawNote: `${deposit.prefix}-${note}` })

      if (withdrawEvent) {
        transaction.txHash = withdrawEvent.txHash
        transaction.depositBlock = depositBlock
        transaction.blockNumber = withdrawEvent.blockNumber
      }
    }

    return transaction
  } catch (err) {
    console.error('buildEncryptedTransaction', err.message)
  }
}

// Decrypts a batch of on-chain EncryptedNote events with the account's private key, matches
// each one against its deposit/withdrawal on-chain state, and returns the account's tx history.
// Network/state access (event sync, withdrawal lookup) is injected; the matching algorithm itself
// is framework-independent.
export const decryptAndFormatEncryptedNoteEvents = async ({
  events,
  privateKey,
  netId,
  accounts,
  getEventsService,
  loadWithdrawalEvent,
  onBeforeDepositMatching,
  onBeforeWithdrawalMatching
}) => {
  const decryptedEvents = decryptEncryptedNoteEvents({ events, privateKey })

  if (onBeforeDepositMatching) {
    onBeforeDepositMatching()
  }

  const instances = decryptedEvents.reduce((acc, curr) => {
    const instance = getInstanceByAddress({ netId, address: curr.address })
    if (!instance) {
      return acc
    }
    const name = `${netId}${instance.amount}${instance.currency}`
    if (!acc[name]) {
      acc[name] = { ...instance, service: getEventsService({ netId, ...instance }) }
    }
    return acc
  }, {})

  await Promise.all(
    [].concat(
      Object.values(instances).map((instance) => instance.service.updateEvents(eventsType.DEPOSIT)),
      Object.values(instances).map((instance) => instance.service.updateEvents(eventsType.WITHDRAWAL))
    )
  )

  const eventBatches = groupEventsIntoBatches(decryptedEvents)
  let result = []

  for (const batch of eventBatches) {
    try {
      const depositPromises = batch.map((event) => {
        const instance = getInstanceByAddress({ netId, address: event.address })
        if (!instance) {
          return
        }
        const { service } = instances[`${netId}${instance.amount}${instance.currency}`]
        return loadDepositForEvent({ event, netId, service, instance })
      })

      const proceedDeposits = await Promise.all(depositPromises)

      if (onBeforeWithdrawalMatching) {
        onBeforeWithdrawalMatching()
      }

      const proceedEvents = await Promise.all(
        proceedDeposits
          .filter(Boolean)
          .map(([event, deposit]) =>
            buildEncryptedTransaction({ event, deposit, netId, accounts, loadWithdrawalEvent })
          )
      )

      result = result.concat(proceedEvents)
    } catch (e) {
      console.error('decryptAndFormatEncryptedNoteEvents', e)
    }
  }

  return summarizeDecryptedTransactions(result)
}
