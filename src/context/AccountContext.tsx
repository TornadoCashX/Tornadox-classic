import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { useAppContext } from '@/context/AppContext'
import { getRetryingEventService, withEventReadRetry } from '@/lib/eventReads'
import { decryptAndFormatEncryptedNoteEvents } from '@/services/accountNoteDecryptFlow'
import { findWithdrawalEvent, type EventsInterface } from '@/services/depositLookup'
import { parseNote } from '@/utils/crypto'
import { encodeEchoData, estimateGasWithBuffer, getEchoAddress, getEchoEventsForAddress, getAllEncryptedNoteEvents } from '@/lib/contracts'
import { useIdleTimer } from '@/hooks/useIdleTimer'
import { useTransactions } from '@/context/TransactionsContext'
import { waitForTxReceipt } from '@/lib/txWatcher'
import {
  deriveAccountFromPrivateKey,
  encryptNoteForAccount,
  repackChainAccountBlobForWalletDecrypt,
  wrapAccountKeyForWallet
} from '@/services/accountCrypto'

import SessionUpdateModal from '@/components/account/SessionUpdateModal'

const IDLE_TIMEOUT_MS = 5 * 60 * 1000

export interface NoteAccountAddresses {
  encrypt: string
  backup: string
  connect: string
}

interface DecryptSummary {
  spent: number
  unSpent: number
}

export interface RecoveredAccount {
  addresses: NoteAccountAddresses
  privateKey: string
}

interface NoteAccountContextValue {
  isExistAccount: boolean
  isCheckingAccount: boolean
  isSetupAccount: boolean
  addresses: NoteAccountAddresses | null
  statistic: Array<{ amount: number; currency: string }>
  isEnabledSaveFile: boolean
  isHighlightedNoteAccount: boolean
  refreshAccountExistence: () => Promise<boolean>
  setupAccount: (privateKey: string) => Promise<void>
  removeAccount: () => void
  recoverAccountFromKey: (rawKey: string) => RecoveredAccount
  recoverAccountFromChain: () => Promise<RecoveredAccount>
  getRecoveryKey: () => Promise<string | undefined>
  decryptNotes: (recovered?: RecoveredAccount) => Promise<DecryptSummary | undefined>
  getEncryptedNoteForDeposit: (data: string) => string | undefined
  toggleEnabledSaveFile: () => void
  highlightNoteAccount: (value: boolean) => void
}

const AccountContext = createContext<NoteAccountContextValue | null>(null)

// Decrypted Note Account keys are intentionally memory-only. Persisting them in sessionStorage
// makes them readable to any script running on the origin until the tab closes. A reload may ask
// the wallet to decrypt the recovery key again, which is the safer default for this feature.
const privateKeys = new Map<string, string>()
const readSessionKey = (address: string): string | undefined => privateKeys.get(address)
const writeSessionKey = (address: string, privateKey: string) => privateKeys.set(address, privateKey)
const clearSessionKeys = () => privateKeys.clear()

// Ports modules/account/store's actions (checkExistAccount, setupAccount, saveAccount,
// removeAccount, getRecoveryKey, checkRecoveryKey, recoverAccountFromKey,
// recoverAccountFromChain, decryptNotes, getEncryptedNote, enabledSaveFile,
// highlightNoteAccount) as a React context/hook instead of a namespaced Vuex module.
//
// Deliberate simplification vs classic: state here is for the *current* wallet+chain only,
// reset whenever either changes, rather than classic's per-netId cached Vuex state - the same
// wallet can have a different (or no) Note Account per chain, and re-deriving on switch avoids
// carrying stale state across networks. See the plan doc for the full rationale.
export const AccountProvider = ({ children }: { children: ReactNode }) => {
  const { netId, wallet } = useAppContext()
  const { saveMany } = useTransactions()

  const [isExistAccount, setIsExistAccount] = useState(false)
  const [isCheckingAccount, setIsCheckingAccount] = useState(false)
  const [addresses, setAddresses] = useState<NoteAccountAddresses | null>(null)
  const [encryptedPublicKey, setEncryptedPublicKey] = useState<string | null>(null)
  const [encryptedPrivateKeyHex, setEncryptedPrivateKeyHex] = useState<string | null>(null)
  const [statistic, setStatistic] = useState<Array<{ amount: number; currency: string }>>([])
  const [isEnabledSaveFile, setIsEnabledSaveFile] = useState(true)
  const [isHighlightedNoteAccount, setIsHighlightedNoteAccount] = useState(false)
  const accountLookupId = useRef(0)
  const echoEventsCache = useRef(new Map<string, ReturnType<typeof getEchoEventsForAddress>>())
  const accountScopeRef = useRef(`${netId}:${wallet.address ?? ''}`)
  accountScopeRef.current = `${netId}:${wallet.address ?? ''}`

  const isSetupAccount = Boolean(encryptedPublicKey)

  const resetLocalState = useCallback(() => {
    setAddresses(null)
    setEncryptedPublicKey(null)
    setEncryptedPrivateKeyHex(null)
    setStatistic([])
    setIsEnabledSaveFile(true)
    setIsExistAccount(false)
  }, [])

  const loadEchoEvents = useCallback(
    (force = false) => {
      if (!wallet.address) return Promise.resolve([])
      const scope = `${netId}:${wallet.address.toLowerCase()}`
      if (force) echoEventsCache.current.delete(scope)

      let lookup = echoEventsCache.current.get(scope)
      if (!lookup) {
        lookup = getEchoEventsForAddress(netId, wallet.address).catch((error) => {
          if (echoEventsCache.current.get(scope) === lookup) {
            echoEventsCache.current.delete(scope)
          }
          throw error
        })
        echoEventsCache.current.set(scope, lookup)
      }
      return lookup
    },
    [netId, wallet.address]
  )

  // Echo history is optional Note Account data. It is loaded explicitly by AccountPage or an
  // account action, rather than on every wallet connection and network switch.
  const refreshAccountExistence = useCallback(async (): Promise<boolean> => {
    if (!wallet.address) {
      setIsExistAccount(false)
      return false
    }

    const lookupId = ++accountLookupId.current
    const operationScope = `${netId}:${wallet.address}`
    setIsCheckingAccount(true)
    try {
      const events = await loadEchoEvents()
      const exists = Boolean(events.length)
      if (lookupId === accountLookupId.current && accountScopeRef.current === operationScope) {
        setIsExistAccount(exists)
      }
      return exists
    } finally {
      if (lookupId === accountLookupId.current && accountScopeRef.current === operationScope) {
        setIsCheckingAccount(false)
      }
    }
  }, [netId, wallet.address, loadEchoEvents])

  // Mirrors modules/account/store/actions/checkRecoveryKey.js - self-heals local state if
  // neither a cached session key nor a wallet-encrypted blob is available.
  const checkRecoveryKey = useCallback(() => {
    if (!addresses) return
    const cached = readSessionKey(addresses.encrypt)
    if (!cached && !encryptedPrivateKeyHex) {
      resetLocalState()
    }
  }, [addresses, encryptedPrivateKeyHex, resetLocalState])

  useEffect(() => {
    ++accountLookupId.current
    resetLocalState()
    setIsCheckingAccount(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.address, netId])

  useEffect(() => {
    checkRecoveryKey()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveAccount = useCallback(
    ({
      address,
      publicKey,
      encryptedPrivateKeyHex: encryptedKey,
      backup
    }: {
      address: string
      publicKey: string
      encryptedPrivateKeyHex: string
      backup?: string
    }) => {
      setEncryptedPublicKey(publicKey)
      setEncryptedPrivateKeyHex(encryptedKey)
      setAddresses({ encrypt: address, backup: backup || '-', connect: wallet.address || '' })
    },
    [wallet.address]
  )

  // Mirrors modules/account/store/actions/setupAccount/setupAccount.js + saveEncryptedAccount.js:
  // wraps a (caller-supplied, already-generated-and-displayed) Note Account private key for the
  // connected wallet, publishes it on-chain via the Echoer contract's echo(bytes), then activates
  // it locally.
  const setupAccount = useCallback(
    async (privateKey: string) => {
      if (!wallet.address) throw new Error('No injected wallet found')
      const operationScope = `${netId}:${wallet.address}`

      const events = await loadEchoEvents(true)
      const exists = Boolean(events.length)
      if (accountScopeRef.current !== operationScope) {
        throw new Error('Wallet or network changed during account lookup')
      }
      setIsExistAccount(exists)
      if (exists) {
        throw new Error('An account is already associated with this Web3 wallet. Please use Recover Account instead.')
      }

      const walletPublicKey = await wallet.requestWalletEncryptionPublicKey(wallet.address)
      const wrapped = wrapAccountKeyForWallet({ privateKey, walletPublicKey })

      const echoAddress = getEchoAddress(netId)
      const data = encodeEchoData(wrapped.onChainPayload)
      const gas = await estimateGasWithBuffer(netId, { from: wallet.address, to: echoAddress, data })
      const txHash = await wallet.sendWalletTransaction({
        chainId: netId,
        to: echoAddress,
        data,
        gas: `0x${gas.toString(16)}`
      })
      const receipt = await waitForTxReceipt({ netId, txHash })
      if (!receipt.status) throw new Error('Account backup transaction failed')
      if (accountScopeRef.current !== operationScope) return

      writeSessionKey(wrapped.address, privateKey)
      echoEventsCache.current.delete(`${netId}:${wallet.address.toLowerCase()}`)
      setIsExistAccount(true)
      saveAccount({
        address: wrapped.address,
        publicKey: wrapped.publicKey,
        encryptedPrivateKeyHex: wrapped.encryptedPrivateKeyHex,
        backup: wallet.address
      })
    },
    [netId, wallet, loadEchoEvents, saveAccount]
  )

  // Mirrors modules/account/store/actions/removeAccount.js - forgets the account locally (the
  // on-chain Echo event, if any, is untouched and can be recovered again later).
  const removeAccount = useCallback(() => {
    clearSessionKeys()
    resetLocalState()
  }, [resetLocalState])

  // Mirrors modules/account/store/actions/recoverAccountFromKey.js - purely local: the user
  // already has the plaintext key (e.g. from a downloaded backup file), so no wallet decrypt is
  // needed and there's no wallet-encrypted blob to store (encryptedPrivateKeyHex stays empty).
  const recoverAccountFromKey = useCallback(
    (rawKey: string): RecoveredAccount => {
      const privateKey = rawKey.slice(0, 2) === '0x' ? rawKey.slice(2) : rawKey
      const { address, publicKey } = deriveAccountFromPrivateKey(privateKey)
      const recoveredAddresses = { encrypt: address, backup: '-', connect: wallet.address || '' }
      writeSessionKey(address, privateKey)
      saveAccount({ address, publicKey, encryptedPrivateKeyHex: '' })
      return { addresses: recoveredAddresses, privateKey }
    },
    [saveAccount, wallet.address]
  )

  // Mirrors modules/account/store/actions/recoverAccountFromChain/*.js - fetches the latest
  // Echo event for the connected wallet and decrypts it via the wallet's encryption RPC.
  const recoverAccountFromChain = useCallback(async (): Promise<RecoveredAccount> => {
    if (!wallet.address) throw new Error('No injected wallet found')
    const operationScope = `${netId}:${wallet.address}`

    const events = await loadEchoEvents()
    const lastEvent = events[events.length - 1]
    if (!lastEvent) {
      throw new Error("Please set up an account. There is no account for this address.")
    }

    const encryptedKeyHex = repackChainAccountBlobForWalletDecrypt(lastEvent.encryptedAccount)
    const privateKey = await wallet.decryptWithWallet(encryptedKeyHex, wallet.address)
    const { address, publicKey } = deriveAccountFromPrivateKey(privateKey)
    if (accountScopeRef.current !== operationScope) throw new Error('Wallet or network changed during recovery')

    writeSessionKey(address, privateKey)
    const recoveredAddresses = { encrypt: address, backup: lastEvent.address, connect: wallet.address }
    saveAccount({ address, publicKey, encryptedPrivateKeyHex: encryptedKeyHex, backup: lastEvent.address })
    return { addresses: recoveredAddresses, privateKey }
  }, [netId, wallet, loadEchoEvents, saveAccount])

  // Mirrors modules/account/store/actions/getRecoveryKey.js - the central gate every
  // decrypt/recovery-key-dependent operation goes through: session-cache first, else a wallet
  // wallet decrypt prompt (cached afterwards so the user isn't re-prompted every time this session).
  const getRecoveryKey = useCallback(async (): Promise<string | undefined> => {
    if (!addresses || !wallet.address) return undefined

    const cached = readSessionKey(addresses.encrypt)
    if (cached) return cached

    if (!encryptedPrivateKeyHex) return undefined

    try {
      const privateKey = await wallet.decryptWithWallet(encryptedPrivateKeyHex, wallet.address)
      writeSessionKey(addresses.encrypt, privateKey)
      return privateKey
    } catch (err) {
      console.error('getRecoveryKey', err)
      return undefined
    }
  }, [addresses, encryptedPrivateKeyHex, wallet])

  const loadWithdrawalEvent = useCallback(
    async ({ withdrawNote }: { withdrawNote: string }) => {
      const note = parseNote(withdrawNote)
      const event = await withEventReadRetry(netId, (eventsInterface: EventsInterface) =>
        findWithdrawalEvent({ eventsInterface, note })
      )
      if (!event) return undefined
      return { txHash: event.transactionHash, blockNumber: event.blockNumber }
    },
    [netId]
  )

  // Mirrors modules/account/store/actions/decryptNotes/*.js - fetches every EncryptedNote event
  // network-wide, decrypts the ones matching this account's key, and cross-references them
  // against each pool's deposit/withdrawal history to compute spent/unspent status.
  const decryptNotes = useCallback(async (recovered?: RecoveredAccount): Promise<DecryptSummary | undefined> => {
    const operationScope = accountScopeRef.current
    const privateKey = recovered?.privateKey ?? (await getRecoveryKey())
    const accountAddresses = recovered?.addresses ?? addresses
    if (!privateKey || !accountAddresses) return undefined

    const events = await getAllEncryptedNoteEvents(netId)
    const { transactions, statistic: newStatistic, unSpent } = await decryptAndFormatEncryptedNoteEvents({
      events,
      privateKey,
      netId,
      accounts: accountAddresses,
      getEventsService: (params: any) => getRetryingEventService(netId, params),
      loadWithdrawalEvent,
      onBeforeDepositMatching: undefined,
      onBeforeWithdrawalMatching: undefined
    })

    if (accountScopeRef.current !== operationScope) return undefined
    if (transactions.length) saveMany('encryptedTxs', transactions)

    setStatistic(newStatistic)

    return {
      spent: transactions.length - unSpent,
      unSpent
    }
  }, [netId, addresses, getRecoveryKey, loadWithdrawalEvent, saveMany])

  // Mirrors modules/account/store/actions/getEncryptedNote.js - used by DepositTab's
  // executeDepositFlow when the user opts into an on-chain encrypted backup of a new note.
  const getEncryptedNoteForDeposit = useCallback(
    (data: string): string | undefined => {
      if (!encryptedPublicKey) return undefined
      return encryptNoteForAccount({ data, accountPublicKey: encryptedPublicKey })
    },
    [encryptedPublicKey]
  )

  const toggleEnabledSaveFile = useCallback(() => setIsEnabledSaveFile((prev) => !prev), [])
  const highlightNoteAccount = useCallback((value: boolean) => setIsHighlightedNoteAccount(value), [])

  // Mirrors layouts/default.vue's <v-idle :duration="300" @idle="handleOpenModal">: after 5
  // minutes of no mouse/keyboard activity, if there's an active session (a recovery key
  // currently cached), ask the user to confirm they want to keep it. Only enabled while a Note
  // Account is actually active - nothing to protect otherwise.
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false)
  useIdleTimer(
    () => {
      if (addresses && readSessionKey(addresses.encrypt)) {
        setIsSessionModalOpen(true)
      }
    },
    IDLE_TIMEOUT_MS,
    isSetupAccount
  )

  const value = useMemo<NoteAccountContextValue>(
    () => ({
      isExistAccount,
      isCheckingAccount,
      isSetupAccount,
      addresses,
      statistic,
      isEnabledSaveFile,
      isHighlightedNoteAccount,
      refreshAccountExistence,
      setupAccount,
      removeAccount,
      recoverAccountFromKey,
      recoverAccountFromChain,
      getRecoveryKey,
      decryptNotes,
      getEncryptedNoteForDeposit,
      toggleEnabledSaveFile,
      highlightNoteAccount
    }),
    [
      isExistAccount,
      isCheckingAccount,
      isSetupAccount,
      addresses,
      statistic,
      isEnabledSaveFile,
      isHighlightedNoteAccount,
      refreshAccountExistence,
      setupAccount,
      removeAccount,
      recoverAccountFromKey,
      recoverAccountFromChain,
      getRecoveryKey,
      decryptNotes,
      getEncryptedNoteForDeposit,
      toggleEnabledSaveFile,
      highlightNoteAccount
    ]
  )

  return (
    <AccountContext.Provider value={value}>
      {children}
      {isSessionModalOpen && (
        <SessionUpdateModal
          onConfirm={() => {}}
          onCancel={removeAccount}
          onClose={() => setIsSessionModalOpen(false)}
        />
      )}
    </AccountContext.Provider>
  )
}

export const useAccountContext = () => {
  const ctx = useContext(AccountContext)
  if (!ctx) throw new Error('useAccountContext must be used within AccountProvider')
  return ctx
}
