// @ts-check
import { buildProofInputFromTree, generateWithdrawalProof } from '@/services/proof'
import { createWithdrawalProofDTO } from '@/services/protocolDto'

export const createWithdrawalProofFlow = async ({
  root,
  note,
  tree,
  recipient,
  leafIndex,
  nativeCurrency,
  selectedRelayer,
  getRelayerFee,
  ethToReceive,
  buildRelayerTransaction,
  calculateRelayerFee,
  generateProof = generateWithdrawalProof
}) => {
  const { pathElements, pathIndices } = tree.path(leafIndex)
  let relayer = BigInt(0)
  let fee = BigInt(0)
  let refund = BigInt(0)

  const calculateProof = () => {
    const input = buildProofInputFromTree({
      fee,
      root,
      refund,
      relayer,
      recipient,
      note,
      pathElements,
      pathIndices
    })

    return generateProof(input).then(createWithdrawalProofDTO)
  }

  if (!selectedRelayer?.address) {
    throw new Error('Relayer address is required')
  }

  relayer = BigInt(selectedRelayer.address)
  fee = BigInt(getRelayerFee())
  if (note.currency !== nativeCurrency) {
    refund = BigInt(ethToReceive.toString())
  }

  const initialProof = await calculateProof()
  if (Number(note.netId) === 1) {
    return initialProof
  }

  const transaction = buildRelayerTransaction({
    proof: initialProof.proof,
    withdrawCallArgs: initialProof.args,
    amount: note.amount,
    currency: note.currency
  })

  await calculateRelayerFee({ tx: transaction })
  fee = BigInt(getRelayerFee())

  return calculateProof()
}

export const prepareWithdrawalFlow = async ({
  serializedNote,
  recipient,
  parseNote,
  buildTree,
  isSpent,
  createProof,
  spentMessage,
  missingDepositMessage
}) => {
  const note = parseNote(serializedNote)

  if (await isSpent(note)) {
    throw new Error(spentMessage)
  }

  const { tree, root } = await buildTree(note)

  const leafIndex = tree.indexOf(note.commitmentHex)
  if (leafIndex < 0) {
    throw new Error(missingDepositMessage)
  }

  return createProof({ root, tree, recipient, note, leafIndex })
}
