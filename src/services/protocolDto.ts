import { normalizeChainId, TransactionType } from '@/services/protocolTypes'

const requireValue = <T>(value: T, field: string): T => {
  if (value === undefined || value === null || (value as unknown) === '') {
    throw new Error(`${field} is required`)
  }

  return value
}

const requireNonNegativeInteger = (value: string | number, field: string): number => {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${field} must be a non-negative integer`)
  }
  return number
}

export interface DepositIntentDTO {
  amount: string
  currency: string
  netId: string
  prefix: string
}

export const createDepositIntentDTO = (prefix: string): DepositIntentDTO => {
  const parts = String(prefix || '').split('-')
  const [protocol, currency, amount, netId] = parts

  if (parts.length !== 4 || protocol !== 'tornado' || !currency || !amount || !netId) {
    throw new Error('Invalid deposit prefix')
  }

  return Object.freeze({ amount, currency, netId: String(normalizeChainId(netId)), prefix })
}

export interface SerializedNoteDTO {
  amount: string
  currency: string
  netId: string
  note: string
  serializedNote: string
}

export const createSerializedNoteDTO = (serializedNote: string): SerializedNoteDTO => {
  const parts = String(serializedNote || '').split('-')
  const [protocol, currency, amount, netId, note] = parts

  if (
    parts.length !== 5 ||
    protocol !== 'tornado' ||
    !currency ||
    !amount ||
    !netId ||
    !/^0x[0-9a-fA-F]{124}$/.test(note)
  ) {
    throw new Error('Invalid withdrawal note')
  }

  return Object.freeze({
    amount,
    currency,
    netId: String(normalizeChainId(netId)),
    note,
    serializedNote
  })
}

interface NetworkTokenConfig {
  decimals: string | number
  instanceAddress: Record<string, string>
  tokenAddress?: string
}

interface CreatePoolDTOInput {
  network: { tokens?: Record<string, NetworkTokenConfig> } | undefined
  netId: string | number
  currency: string
  amount: string | number
  unsupportedMessage?: string
}

export interface PoolDTO {
  amount: string
  chainId: number
  currency: string
  decimals: number
  instanceAddress: string
  tokenAddress: string | null
}

export const createPoolDTO = ({
  network,
  netId,
  currency,
  amount,
  unsupportedMessage = 'Pool is not supported'
}: CreatePoolDTOInput): PoolDTO => {
  const chainId = normalizeChainId(netId)
  const token = network?.tokens?.[currency]
  const instanceAddress = token?.instanceAddress?.[amount]

  if (!token || !instanceAddress) {
    throw new Error(unsupportedMessage)
  }

  return Object.freeze({
    amount: String(amount),
    chainId,
    currency,
    decimals: requireNonNegativeInteger(token.decimals, 'Token decimals'),
    instanceAddress,
    tokenAddress: token.tokenAddress || null
  })
}

interface CreateTransactionRequestDTOInput {
  from: string
  to: string
  data: string
  value?: string
}

export interface TransactionRequestDTO {
  data: string
  from: string
  to: string
  value: string
}

export const createTransactionRequestDTO = ({
  from,
  to,
  data,
  value = '0x00'
}: CreateTransactionRequestDTOInput): TransactionRequestDTO => {
  return Object.freeze({
    data: requireValue(data, 'Transaction data'),
    from: requireValue(from, 'Transaction sender'),
    to: requireValue(to, 'Transaction target'),
    value: requireValue(value, 'Transaction value')
  })
}

interface CreateDepositRecordDTOInput {
  txHash: string
  note: string
  amount: string | number
  storeType: string
  prefix: string
  netId: string | number
  timestamp: string | number
  index?: string | number
  nullifierHex: string
  commitmentHex: string
  currency: string
  owner?: string
  backupAccount?: string
}

export interface DepositRecordDTO {
  amount: string
  commitmentHex: string
  currency: string
  index?: number
  netId: string
  note: string
  nullifierHex: string
  prefix: string
  storeType: string
  timestamp: number
  txHash: string
  type: TransactionType
  owner?: string
  backupAccount?: string
}

export const createDepositRecordDTO = ({
  txHash,
  note,
  amount,
  storeType,
  prefix,
  netId,
  timestamp,
  index,
  nullifierHex,
  commitmentHex,
  currency,
  owner,
  backupAccount
}: CreateDepositRecordDTOInput): DepositRecordDTO => {
  const record: DepositRecordDTO = {
    amount: String(amount),
    commitmentHex: requireValue(commitmentHex, 'Commitment'),
    currency,
    netId: String(normalizeChainId(netId)),
    note: requireValue(note, 'Deposit note'),
    nullifierHex: requireValue(nullifierHex, 'Nullifier'),
    prefix,
    storeType,
    timestamp: requireNonNegativeInteger(timestamp, 'Deposit timestamp'),
    txHash: requireValue(txHash, 'Transaction hash'),
    type: TransactionType.DEPOSIT
  }

  if (index !== undefined) {
    record.index = requireNonNegativeInteger(index, 'Deposit index')
  }

  if (owner !== undefined || backupAccount !== undefined) {
    record.owner = owner || ''
    record.backupAccount = backupAccount || ''
  }

  return record
}

interface CreateWithdrawalProofDTOInput {
  proof: string
  args: unknown[]
}

export interface WithdrawalProofDTO {
  args: unknown[]
  proof: string
}

export const createWithdrawalProofDTO = ({
  proof,
  args
}: CreateWithdrawalProofDTOInput): WithdrawalProofDTO => {
  if (!Array.isArray(args) || args.length !== 6) {
    throw new Error('Withdrawal arguments must contain 6 values')
  }

  return Object.freeze({
    args: [...args],
    proof: requireValue(proof, 'Withdrawal proof')
  })
}

interface CreateRelayerWithdrawRequestDTOInput {
  proof: string
  args: unknown[]
  contract: string
}

export interface RelayerWithdrawRequestDTO {
  args: unknown[]
  contract: string
  proof: string
}

export const createRelayerWithdrawRequestDTO = ({
  proof,
  args,
  contract
}: CreateRelayerWithdrawRequestDTOInput): RelayerWithdrawRequestDTO => {
  const withdrawal = createWithdrawalProofDTO({ proof, args })

  return Object.freeze({
    args: withdrawal.args,
    contract: requireValue(contract, 'Tornado pool contract'),
    proof: withdrawal.proof
  })
}
