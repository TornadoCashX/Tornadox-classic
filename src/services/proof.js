import { legacyProofRuntime } from '@/services/legacyProofRuntime'
import { getTornadoKeys } from '@/services/runtimeAssets'
import { buildWithdrawalArgs, buildWithdrawalInput } from '@/services/withdrawal'

export const buildProofInputFromTree = ({
  fee,
  root,
  refund,
  relayer,
  recipient,
  note,
  pathElements,
  pathIndices
}) => {
  return buildWithdrawalInput({
    fee,
    root,
    refund,
    relayer,
    recipient,
    note,
    pathElements,
    pathIndices
  })
}

export const createWithdrawalProofGenerator = ({
  loadKeys = getTornadoKeys,
  proofRuntime = legacyProofRuntime
} = {}) => {
  return async (input) => {
    const { circuit, provingKey } = await loadKeys()
    const proof = await proofRuntime.prove(input, { circuit, provingKey })
    return { args: buildWithdrawalArgs(input), proof }
  }
}

export const generateWithdrawalProof = createWithdrawalProofGenerator()
