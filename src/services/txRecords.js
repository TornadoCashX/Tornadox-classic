import txStatus from '@/store/txStatus'
import { parseNote as parseNoteDefault } from '@/utils'

export const getTxStatusClass = (status) => {
  switch (status) {
    case txStatus.waitingForReciept:
      return 'is-loading'
    case txStatus.success:
      return 'is-success'
    case txStatus.fail:
      return 'is-danger'
    default:
      return undefined
  }
}

export const buildTxExplorerUrl = ({ explorerUrl, txHash }) => explorerUrl.tx + txHash
export const buildAddressExplorerUrl = ({ explorerUrl, address }) => explorerUrl.address + address
export const buildBlockExplorerUrl = ({ explorerUrl, block }) => explorerUrl.block + block

// Builds the local tx record (and target Vuex mutation) for a completed tornado
// withdrawal, matching it against any existing encrypted-note or plain deposit record.
export const buildTornadoWithdrawalRecord = async ({
  note,
  txHash,
  fee,
  amount,
  currency,
  netId,
  action = 'Withdraw',
  encryptedTxs,
  txs,
  getBlockNumber,
  loadDepositEvent,
  parseNote = parseNoteDefault
}) => {
  const timestamp = Math.round(Date.now() / 1000)
  const [tornado, , , , hexNote] = note.split('-')
  const { commitmentHex } = parseNote(note)

  const tx = {
    txHash,
    type: action,
    amount,
    currency,
    fee,
    netId,
    timestamp,
    status: 2,
    prefix: `${tornado}-${currency}-${amount}-${netId}`,
    isSpent: true
  }

  const encrypted = encryptedTxs.find((entry) => entry.commitmentHex === commitmentHex)
  tx.storeType = encrypted ? 'encryptedTxs' : 'txs'
  tx.note = encrypted ? encrypted.note : hexNote

  const deposit = encrypted || txs.find((entry) => entry.note === hexNote)

  tx.blockNumber = await getBlockNumber({ txHash })

  if (deposit && deposit.txHash) {
    tx.txHash = deposit.txHash
    tx.withdrawTxHash = txHash
    return { mutation: 'UPDATE_DEPOSIT', tx }
  }

  const events = await loadDepositEvent({ withdrawNote: note })
  tx.withdrawTxHash = txHash
  tx.txHash = events.txHash
  tx.depositBlock = events.depositBlock
  tx.index = events.leafIndex

  return { mutation: 'SAVE_TX_HASH', tx }
}
