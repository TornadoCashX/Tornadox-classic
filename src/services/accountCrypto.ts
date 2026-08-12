import { encrypt, getEncryptionPublicKey as deriveEncryptionPublicKey } from 'eth-sig-util'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

import { packEncryptedMessage, unpackEncryptedMessage } from '@/utils/crypto'

export interface EncryptedData {
  version: string
  nonce: string
  ephemPublicKey: string
  ciphertext: string
}

const stripHexPrefix = (key: string) => (key.slice(0, 2) === '0x' ? key.slice(2) : key)

// Wallet eth_decrypt RPC methods expect their `encryptedData` param hex-encoded from the
// JSON-stringified {version,nonce,ephemPublicKey,ciphertext} object - mirrors classic's
// `Buffer.from(JSON.stringify(x)).toString('hex')` idiom (modules/account/store/actions/
// getEncryptedAccount.js, recoverAccountFromChain/getAccountFromAddress.js). This is a
// different, more verbose encoding than packEncryptedMessage's compact on-chain layout.
const toEthDecryptHex = (encryptedData: EncryptedData): string =>
  Buffer.from(JSON.stringify(encryptedData)).toString('hex')

// Mirrors web3.eth.accounts.create() usage in modules/account/modals/SetupAccount.vue - a
// fresh random secp256k1 keypair that becomes the Note Account's identity.
export const generateAccountKeypair = (): { privateKey: string; address: string } => {
  const privateKey = generatePrivateKey()
  const { address } = privateKeyToAccount(privateKey)
  return { privateKey, address }
}

// Mirrors modules/account/store/actions/getEncryptedAccount.js: wraps a Note Account private
// key so only the connected wallet (via eth_decrypt) can unwrap it again, and produces both
// encodings needed downstream - the compact one for the Echoer on-chain `echo(bytes)` write,
// and the eth_decrypt-hex one for storing app-side (sessionStorage / local state) and later
// decrypting.
export const wrapAccountKeyForWallet = ({
  privateKey,
  walletPublicKey
}: {
  privateKey: string
  walletPublicKey: string
}) => {
  const keyWithoutPrefix = stripHexPrefix(privateKey)
  const { address } = privateKeyToAccount(`0x${keyWithoutPrefix}`)
  const publicKey = deriveEncryptionPublicKey(keyWithoutPrefix)
  const encryptedData = encrypt(walletPublicKey, { data: keyWithoutPrefix }, 'x25519-xsalsa20-poly1305') as EncryptedData

  return {
    address,
    publicKey,
    encryptedPrivateKeyHex: toEthDecryptHex(encryptedData),
    onChainPayload: packEncryptedMessage(encryptedData)
  }
}

// Mirrors modules/account/store/actions/recoverAccountFromKey.js's derivation half and
// recoverAccountFromChain/decryptAccount.js's post-decrypt derivation: given a plaintext Note
// Account private key (pasted by the user, or just decrypted via the wallet), derive its
// address and its own x25519 public key (used to encrypt/decrypt individual notes).
export const deriveAccountFromPrivateKey = (privateKey: string) => {
  const keyWithoutPrefix = stripHexPrefix(privateKey)
  const { address } = privateKeyToAccount(`0x${keyWithoutPrefix}`)
  const publicKey = deriveEncryptionPublicKey(keyWithoutPrefix)
  return { address, publicKey }
}

// Mirrors RecoverAccount.vue's onInput check: privateKeyToAccount throwing *is* the validation,
// and nothing derived from it is needed there. Kept separate from deriveAccountFromPrivateKey so
// a per-keystroke check doesn't also pay for the x25519 derivation that one does.
export const isValidAccountPrivateKey = (privateKey: string): boolean => {
  try {
    privateKeyToAccount(privateKey.startsWith('0x') ? `0x${stripHexPrefix(privateKey)}` : `0x${privateKey}`)
    return true
  } catch {
    return false
  }
}

// Mirrors modules/account/store/actions/getEncryptedNote.js: encrypts a single deposit note
// (`"<instanceAddress>-<note>"`) to the Note Account's own public key, in the compact on-chain
// format (this becomes the TornadoProxy deposit() call's `encryptedNote` bytes param).
export const encryptNoteForAccount = ({ data, accountPublicKey }: { data: string; accountPublicKey: string }): string => {
  const encryptedData = encrypt(accountPublicKey, { data }, 'x25519-xsalsa20-poly1305') as EncryptedData
  return packEncryptedMessage(encryptedData)
}

// Mirrors modules/account/store/actions/recoverAccountFromChain/getAccountFromAddress.js:
// converts the compact on-chain blob (from an Echoer `Echo` event) into the eth_decrypt-hex
// format, ready to hand to the wallet decrypt request.
export const repackChainAccountBlobForWalletDecrypt = (onChainHex: string): string => {
  const encryptedMessage = unpackEncryptedMessage(onChainHex)
  return toEthDecryptHex(encryptedMessage)
}
