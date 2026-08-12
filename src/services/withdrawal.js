import { encodeFunctionData } from 'viem'

import TornadoProxyABI from '@/abis/TornadoProxy.abi.json'
import { toFixedHex } from '@/utils/crypto'

export const buildWithdrawalInput = ({
  fee,
  root,
  refund,
  relayer,
  recipient,
  note,
  pathElements,
  pathIndices
}) => {
  return {
    // public
    fee: BigInt(fee),
    root,
    refund: BigInt(refund),
    relayer: BigInt(relayer),
    recipient: BigInt(recipient),
    nullifierHash: note.nullifierHash,
    // private
    pathIndices,
    pathElements,
    secret: note.secret,
    nullifier: note.nullifier
  }
}

export const buildWithdrawalArgs = (input) => {
  return [
    toFixedHex(input.root),
    toFixedHex(input.nullifierHash),
    toFixedHex(input.recipient, 20),
    toFixedHex(input.relayer, 20),
    toFixedHex(input.fee),
    toFixedHex(input.refund)
  ]
}

export const buildRelayerWithdrawalTx = ({ tornadoProxyAddress, tornadoInstanceAddress, proof, withdrawCallArgs }) => {
  const data = encodeFunctionData({
    abi: TornadoProxyABI,
    functionName: 'withdraw',
    args: [tornadoInstanceAddress, proof, ...withdrawCallArgs]
  })

  return {
    to: tornadoProxyAddress,
    data,
    value: withdrawCallArgs[5] || 0
  }
}
