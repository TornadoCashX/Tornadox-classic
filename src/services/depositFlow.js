// @ts-check
import { encodeFunctionData, isAddress, parseUnits, toHex } from 'viem'

import TornadoProxyABI from '@/abis/TornadoProxy.abi.json'
import { createDepositNote } from '@/services/deposit'
import {
  createDepositIntentDTO,
  createDepositRecordDTO,
  createPoolDTO,
  createTransactionRequestDTO
} from '@/services/protocolDto'
import { parseHexNote } from '@/utils'

export const parseDepositPrefix = (prefix) => {
  const { amount, currency, netId } = createDepositIntentDTO(prefix)
  return { amount, currency, netId }
}

export const prepareDepositFlow = async ({
  prefix,
  contractAddress,
  scheduleBackup,
  unsupportedNetworkMessage = 'Network is not supported',
  createNote = createDepositNote
}) => {
  parseDepositPrefix(prefix)

  if (!contractAddress) {
    throw new Error(unsupportedNetworkMessage)
  }

  const { note, commitmentHex } = await createNote()

  if (scheduleBackup) {
    scheduleBackup({ note, prefix })
  }

  return { note, commitment: commitmentHex, prefix }
}

export const executeDepositFlow = async ({
  commitment,
  note,
  prefix,
  isEncrypted,
  network,
  contractAddress,
  account,
  nativeCurrency,
  encryptedAccounts,
  getEncryptedNote,
  getGasLimit,
  sendTransaction,
  missingCommitmentMessage = 'Deposit commitment is missing',
  unsupportedNetworkMessage = 'Network is not supported',
  now = () => Math.round(Date.now() / 1000)
}) => {
  if (!commitment) {
    throw new Error(missingCommitmentMessage)
  }

  const intent = createDepositIntentDTO(prefix)
  const { amount, currency, netId } = intent

  if (!contractAddress) {
    throw new Error(unsupportedNetworkMessage)
  }

  const pool = createPoolDTO({
    network,
    netId,
    currency,
    amount,
    unsupportedMessage: unsupportedNetworkMessage
  })

  const isNative = currency === nativeCurrency
  const value = isNative ? parseUnits(amount, 18) : 0n
  let encryptedNote = []

  if (isEncrypted) {
    encryptedNote = await getEncryptedNote({ data: `${pool.instanceAddress}-${note}` })
  }

  const data = encodeFunctionData({
    abi: TornadoProxyABI,
    functionName: 'deposit',
    args: [pool.instanceAddress, commitment, Array.isArray(encryptedNote) ? '0x' : encryptedNote]
  })
  const transaction = createTransactionRequestDTO({
    from: account,
    to: contractAddress,
    value: toHex(value),
    data
  })
  const gasLimit = await getGasLimit(transaction, 'other', 10)
  const storeType = isEncrypted ? 'encryptedTxs' : 'txs'
  const txHash = await sendTransaction({ gas: toHex(gasLimit), ...transaction })

  const { nullifierHex, commitmentHex } = parseHexNote(note)
  const record = createDepositRecordDTO({
    txHash,
    note,
    amount,
    storeType,
    prefix,
    netId,
    timestamp: now(),
    nullifierHex,
    commitmentHex,
    currency
  })

  if (isEncrypted) {
    return createDepositRecordDTO({
      ...record,
      note: encryptedNote,
      owner: isAddress(encryptedAccounts?.encrypt) ? encryptedAccounts.encrypt : '',
      backupAccount: isAddress(encryptedAccounts?.backup) ? encryptedAccounts.backup : ''
    })
  }

  return record
}
