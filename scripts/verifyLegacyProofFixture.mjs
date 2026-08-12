import { readFile } from 'node:fs/promises'

import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'

const fixture = JSON.parse(
  await readFile(new URL('../src/services/fixtures/legacyWithdrawalProof.fixture.json', import.meta.url), 'utf8')
)
const client = createPublicClient({
  chain: sepolia,
  transport: http(process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com')
})
const poolAbi = [
  {
    type: 'function',
    name: 'verifier',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }]
  }
]
const verifierAbi = [
  {
    type: 'function',
    name: 'verifyProof',
    stateMutability: 'view',
    inputs: [{ type: 'bytes' }, { type: 'uint256[6]' }],
    outputs: [{ type: 'bool' }]
  }
]

const verifier = await client.readContract({
  address: fixture.verifier.pool,
  abi: poolAbi,
  functionName: 'verifier'
})
const valid = await client.readContract({
  address: verifier,
  abi: verifierAbi,
  functionName: 'verifyProof',
  args: [fixture.withdrawal.proof, fixture.withdrawal.args.map(BigInt)]
})

if (valid !== fixture.verifier.expected) {
  throw new Error(`Legacy proof fixture verification returned ${valid}`)
}

console.log(`Legacy proof fixture verified by ${verifier} on Sepolia`)
