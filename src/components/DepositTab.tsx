import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { encodeFunctionData, erc20Abi, formatUnits, maxUint256, parseUnits, toHex, type Address } from 'viem'

import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'

import { useAppContext } from '@/context/AppContext'
import { useAccountContext } from '@/context/AccountContext'
import { useLoading } from '@/context/LoadingContext'
import { useNotice } from '@/context/NoticeContext'
import { useTransactions } from '@/context/TransactionsContext'
import { getNetworkConfig, getSymbol } from '@/lib/networkHelpers'
import { ensureRpcSelected } from '@/lib/rpcSelect'
import {
  estimateGasWithBuffer,
  getNativeBalance,
  getTokenAllowance,
  getTokenBalance,
  getTornadoProxyAddress
} from '@/lib/contracts'
import { waitForTxReceipt } from '@/lib/txWatcher'
import { isUserRejectedRequestError } from '@/lib/walletErrors'
import { useTransactionNotice } from '@/hooks/useTransactionNotice'
import {
  getTokenApprovalSequence,
  isSameTokenPoolSelection,
  type TokenPoolSelection
} from '@/services/tokenApproval'
import txStatus from '@/store/txStatus'
import { saveNoteBackupFile } from '@/utils'
import { interpolate } from '@/utils/i18nFormat'

import { BgIcon } from './Icon'
import Dropdown from './Dropdown'
import Tooltip from './Tooltip'
import DepositModal from './DepositModal'
import BalanceModal from './BalanceModal'
import ConnectButton from './ConnectButton'
import ApproveTokenModal, { type TokenApprovalAmount } from './ApproveTokenModal'
import TokenRiskModal from './TokenRiskModal'

const RISK_TOKEN_SYMBOLS = new Set(['USDC', 'USDT'])

// Mirrors Deposit.vue's shortenAmount -> $n(amount, 'compact'), which plugins/i18n.js defines
// as Intl's { notation: 'compact' } for every locale - without it the larger pools read
// "5000000 cDAI" here instead of classic's "5M cDAI".
const formatCompactAmount = (amount: number, locale: string) =>
  new Intl.NumberFormat(locale, { notation: 'compact' }).format(amount)

const formatTokenBalance = (value: bigint, decimals: number) => {
  const [whole, fraction = ''] = formatUnits(value, decimals).split('.')
  const visibleFraction = fraction.slice(0, 6).replace(/0+$/, '')
  return visibleFraction ? `${whole}.${visibleFraction}` : whole
}

interface PreparedDeposit {
  note: string
  commitment: string
  prefix: string
  netId: number
  currency: string
  amount: number
  account: string
}

interface InsufficientBalance {
  currency: string
  balance: string
}

const DepositTab = () => {
  const { t, i18n } = useTranslation()
  const { netId, selectedCurrency, selectedAmount, setSelectedPool, wallet } = useAppContext()
  const { isSetupAccount, addresses, isEnabledSaveFile, getEncryptedNoteForDeposit } = useAccountContext()
  const { save: saveTx, confirmDeposit } = useTransactions()
  const loading = useLoading()
  const notice = useNotice()
  const trackTransactionNotice = useTransactionNotice()

  const [amountsByCurrency, setAmountsByCurrency] = useState<number[]>([])
  const [prepared, setPrepared] = useState<PreparedDeposit | null>(null)
  const [isBackedUp, setIsBackedUp] = useState(false)
  const [isEncrypted, setIsEncrypted] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isCheckingBalance, setIsCheckingBalance] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [approvalRequest, setApprovalRequest] = useState<TokenPoolSelection | null>(null)
  const [approvalError, setApprovalError] = useState('')
  const [riskRequest, setRiskRequest] = useState<TokenPoolSelection | null>(null)
  const [insufficientBalance, setInsufficientBalance] = useState<InsufficientBalance | null>(null)
  const [error, setError] = useState('')
  const { copy, label: copyLabel } = useCopyToClipboard()

  const config = getNetworkConfig(netId)
  const tokens = config.tokens
  const currentSelection: TokenPoolSelection = {
    netId,
    currency: selectedCurrency,
    amount: selectedAmount,
    account: wallet.address || ''
  }
  const currentSelectionRef = useRef(currentSelection)
  currentSelectionRef.current = currentSelection

  const isRequestCurrent = (request: TokenPoolSelection) =>
    isSameTokenPoolSelection(request, currentSelectionRef.current)

  useEffect(() => {
    const amounts = Object.keys(tokens[selectedCurrency].instanceAddress)
      .map(Number)
      .sort((a, b) => a - b)
    setAmountsByCurrency(amounts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netId, selectedCurrency])

  useEffect(() => {
    if (
      prepared &&
      (prepared.netId !== netId ||
        prepared.currency !== selectedCurrency ||
        prepared.amount !== selectedAmount ||
        prepared.account.toLowerCase() !== wallet.address?.toLowerCase())
    ) {
      setPrepared(null)
    }
  }, [prepared, netId, selectedCurrency, selectedAmount, wallet.address])

  useEffect(() => {
    if (approvalRequest && !isSameTokenPoolSelection(approvalRequest, currentSelection)) {
      setApprovalRequest(null)
      setApprovalError('')
    }
    if (riskRequest && !isSameTokenPoolSelection(riskRequest, currentSelection)) setRiskRequest(null)
    // currentSelection is intentionally represented by its scalar fields below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netId, selectedCurrency, selectedAmount, wallet.address, approvalRequest, riskRequest])

  const onDeposit = async () => {
    if (!wallet.address) return
    const request = { ...currentSelectionRef.current }
    setError('')
    setInsufficientBalance(null)
    setIsCheckingBalance(true)
    try {
      await ensureRpcSelected(request.netId)
      const requestConfig = getNetworkConfig(request.netId)
      const decimals = requestConfig.tokens[request.currency].decimals
      const requiredWei = parseUnits(String(request.amount), decimals)

      const balanceWei =
        request.currency === requestConfig.nativeCurrency
          ? BigInt(await getNativeBalance(request.netId, request.account))
          : await getTokenBalance(request.netId, request.currency, request.account)

      if (!isRequestCurrent(request)) return

      if (balanceWei < requiredWei) {
        setInsufficientBalance({ currency: request.currency, balance: formatTokenBalance(balanceWei, decimals) })
        return
      }

      if (request.currency !== requestConfig.nativeCurrency) {
        const proxyAddress = getTornadoProxyAddress(request.netId)
        const allowance = await getTokenAllowance(request.netId, request.currency, request.account, proxyAddress)
        if (!isRequestCurrent(request)) return
        if (allowance < requiredWei) {
          setApprovalError('')
          setApprovalRequest(request)
          return
        }
      }

      const contractAddress = requestConfig.tokens[request.currency].instanceAddress[request.amount]
      const { prepareDepositFlow } = await import('@/services/depositFlow')
      const result = await prepareDepositFlow({
        prefix: `tornado-${request.currency}-${request.amount}-${request.netId}`,
        contractAddress,
        // Mirrors store/application.js's prepareDeposit: when the account/control panel's
        // "download raw private notes by default" switch is on (default true), auto-download
        // the note as a backup file ~1s after it's generated, rather than relying solely on the
        // note modal's manual Save button.
        scheduleBackup: isEnabledSaveFile
          ? ({ note: backupNote, prefix: backupPrefix }: { note: string; prefix: string }) => {
              setTimeout(() => {
                try {
                  saveNoteBackupFile(backupPrefix, backupNote)
                } catch (err) {
                  console.warn('Note backup as a file is not supported on this device', err)
                }
              }, 1000)
            }
          : undefined,
        unsupportedNetworkMessage: t('networkIsNotSupported')
      })
      setPrepared({
        ...result,
        netId: request.netId,
        currency: request.currency,
        amount: request.amount,
        account: request.account
      })
      setIsBackedUp(false)
      // Mirrors DepositModalBox.vue's beforeMount: default to encrypting on-chain whenever an
      // account is active.
      setIsEncrypted(isSetupAccount)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsCheckingBalance(false)
    }
  }

  const depositableTokens = Object.entries(tokens)

  const onPreDeposit = () => {
    const symbol = getSymbol(netId, selectedCurrency).toUpperCase()
    if (RISK_TOKEN_SYMBOLS.has(symbol)) {
      setRiskRequest({ ...currentSelectionRef.current })
      return
    }
    void onDeposit()
  }

  const onApproveToken = async (approvalAmount: TokenApprovalAmount) => {
    const request = approvalRequest
    if (!request || !isRequestCurrent(request) || wallet.netId !== request.netId) return

    setIsApproving(true)
    setApprovalError('')
    setError('')
    loading.enable(t('preparingTransactionData'))
    try {
      await ensureRpcSelected(request.netId)
      if (!isRequestCurrent(request)) return

      const requestConfig = getNetworkConfig(request.netId)
      const token = requestConfig.tokens[request.currency]
      const proxyAddress = getTornadoProxyAddress(request.netId)
      const tokenAddress = token.tokenAddress as Address | undefined
      if (!tokenAddress) throw new Error(`Token ${request.currency.toUpperCase()} is not supported on this network`)
      const targetAllowance =
        approvalAmount === 'unlimited' ? maxUint256 : parseUnits(String(request.amount), token.decimals)
      const currentAllowance = await getTokenAllowance(
        request.netId,
        request.currency,
        request.account,
        proxyAddress
      )
      if (!isRequestCurrent(request)) return

      const approvalSequence = getTokenApprovalSequence({
        currency: request.currency,
        currentAllowance,
        targetAllowance
      })
      let lastTxHash = ''

      for (const amount of approvalSequence) {
        if (!isRequestCurrent(request)) return
        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [proxyAddress as Address, amount]
        })
        const gas = await estimateGasWithBuffer(request.netId, {
          from: request.account,
          to: tokenAddress,
          data,
          value: '0x0'
        })
        if (!isRequestCurrent(request)) return

        loading.changeText(
          interpolate(t('pleaseConfirmTransactionInWallet'), { wallet: wallet.providerName || 'your wallet' })
        )
        lastTxHash = await wallet.sendWalletTransaction({
          chainId: request.netId,
          to: tokenAddress,
          data,
          value: '0x0',
          gas: toHex(gas)
        })
        loading.changeText(t('waitUntilTransactionIsMined'))
        const receipt = await waitForTxReceipt({ netId: request.netId, txHash: lastTxHash })
        if (!receipt.status) throw new Error(t('transactionFailed'))
      }

      notice.addNoticeWithInterval(
        { type: 'success', title: t('transactionWasSuccessfullySent'), txHash: lastTxHash, netId: request.netId },
        3000
      )
      if (isRequestCurrent(request)) {
        setApprovalRequest(null)
        await onDeposit()
      }
    } catch (err: any) {
      if (!isUserRejectedRequestError(err)) {
        const message = err?.message || String(err)
        setApprovalError(message)
        notice.addNoticeWithInterval({ type: 'danger', title: message }, 5000)
      }
    } finally {
      loading.disable()
      setIsApproving(false)
    }
  }

  const onCopyNote = () => {
    if (!prepared) return
    copy(`${prepared.prefix}-${prepared.note}`)
  }

  const onSaveNote = () => {
    if (!prepared) return
    saveNoteBackupFile(prepared.prefix, prepared.note)
  }

  const onSendDeposit = async () => {
    if (!prepared || !wallet.address) return
    if (
      prepared.netId !== netId ||
      prepared.netId !== wallet.netId ||
      prepared.currency !== selectedCurrency ||
      prepared.amount !== selectedAmount ||
      prepared.account.toLowerCase() !== wallet.address.toLowerCase()
    ) {
      setPrepared(null)
      setError(t('networkIsNotSupported'))
      return
    }
    setIsSending(true)
    setError('')
    // Mirrors DepositModalBox.vue's _sendDeposit: dispatch('loading/enable', {message:
    // preparingTransactionData}) before sendDeposit, dispatch('loading/disable') once it
    // resolves - the confirm-in-wallet and wait-until-mined messages in between are
    // metamask.js's own sendTransaction action (showConfirmLoader, then changeText), fired from
    // inside the sendTransaction callback below since that's the only place with a live
    // "which wallet, and do we have a hash yet" view.
    loading.enable(t('preparingTransactionData'))
    try {
      const { executeDepositFlow } = await import('@/services/depositFlow')
      const contractAddress = getTornadoProxyAddress(netId)
      // wallet.providerName is now the real connected wallet's name (wagmi's connector.name -
      // "MetaMask", "Coinbase Wallet", "WalletConnect", etc.), not a hardcoded MetaMask/
      // WalletConnect guess - the confirm-in-wallet message below names the actual wallet.
      const walletDisplayName = wallet.providerName || 'your wallet'
      const record = await executeDepositFlow({
        commitment: prepared.commitment,
        note: prepared.note,
        prefix: prepared.prefix,
        isEncrypted,
        network: config,
        contractAddress,
        account: wallet.address,
        nativeCurrency: config.nativeCurrency,
        encryptedAccounts: addresses ?? undefined,
        unsupportedNetworkMessage: t('networkIsNotSupported'),
        missingCommitmentMessage: t('failToGenerateNote'),
        getEncryptedNote: async ({ data }: { data: string }) => getEncryptedNoteForDeposit(data) ?? [],
        getGasLimit: async (transaction) => estimateGasWithBuffer(netId, transaction),
        sendTransaction: async (transaction) => {
          // Mirrors loading/showConfirmLoader's pleaseConfirmTransactionInWallet message.
          loading.changeText(interpolate(t('pleaseConfirmTransactionInWallet'), { wallet: walletDisplayName }))
          const txHash = await wallet.sendWalletTransaction({
            chainId: prepared.netId,
            to: transaction.to,
            data: transaction.data,
            value: transaction.value,
            gas: transaction.gas
          })
          loading.changeText(t('waitUntilTransactionIsMined'))
          return txHash
        }
      })
      loading.disable()

      // Mirrors store/application.js's sendDeposit committing txHashKeeper/SAVE_TX_HASH - this
      // is what populates the Transactions list below. wallet.sendWalletTransaction above only waits
      // for the wallet to broadcast (a hash), not for the tx to actually be mined, so this is
      // saved as still-pending (matching classic's own SAVE_TX_HASH-then-CHANGE_TX_STATUS split)
      // rather than immediately marked Deposited.
      const storeType = isEncrypted ? 'encryptedTxs' : 'txs'
      const pendingRecord = { ...(record as any), status: txStatus.waitingForReciept }
      const historyPersisted = saveTx(storeType, pendingRecord)
      if (!historyPersisted) {
        notice.addNoticeWithInterval({ type: 'warning', title: t('transactionHistorySaveFailed') })
      }

      // Keep the deposit notice live until the receipt arrives; confirmation also resolves the
      // actual event leaf index instead of relying on a pre-send nextIndex snapshot.
      const valueLabel = `${selectedAmount} ${getSymbol(netId, selectedCurrency)}`
      trackTransactionNotice({
        netId,
        txHash: (record as any).txHash,
        valueLabel,
        pendingKey: 'depositing',
        successKey: 'depositedValue',
        logLabel: 'deposit tx',
        onConfirmed: ({ blockNumber }) => void confirmDeposit(storeType, pendingRecord, blockNumber),
        onFailed: () => saveTx(storeType, { ...pendingRecord, status: txStatus.fail })
      })

      // Mirrors DepositModalBox.vue's _sendDeposit: on success it just closes the modal
      // (this.$parent.close()) and returns to the plain Deposit form.
      setPrepared(null)
    } catch (err: any) {
      if (!isUserRejectedRequestError(err)) setError(err?.message || String(err))
    } finally {
      loading.disable()
      setIsSending(false)
    }
  }

  return (
    <div>
      <fieldset>
        <div className="field" data-test="token_list_dropdown">
          <label className="label">{t('token')}</label>
          <Dropdown
            value={selectedCurrency}
            onChange={(currency) => {
              const amounts = Object.keys(tokens[currency].instanceAddress).map(Number)
              setSelectedPool(currency, Math.min(...amounts))
              setPrepared(null)
            }}
            options={depositableTokens.map(([key, tokenInfo]: [string, any]) => ({
              value: key,
              label: tokenInfo.symbol,
              dataTest: `token_list_${tokenInfo.symbol.toLowerCase()}`
            }))}
          />
        </div>

        <div className="field">
          <label className="label">
            {t('amount')}{' '}
            <Tooltip
              trigger={
                <button className="button is-primary has-icon">
                  <BgIcon name="info" />
                </button>
              }
            >
              {t('amountTooltip')}
            </Tooltip>
          </label>
          <div className="b-steps is-small">
            <nav className="steps is-animated is-rounded">
              <ul className="step-items">
                {amountsByCurrency.map((amount) => (
                  <li
                    key={amount}
                    className={`step-item token-${selectedCurrency}-${amount} ${
                      amount === selectedAmount ? 'is-active' : ''
                    }`}
                  >
                    <a
                      className="step-link is-clickable"
                      onClick={() => {
                        setSelectedPool(selectedCurrency, amount)
                        setPrepared(null)
                      }}
                    >
                      <div className="step-marker" />
                      <div className="step-details">
                        <span className="step-title">
                          {formatCompactAmount(amount, i18n.language)} {getSymbol(netId, selectedCurrency)}
                        </span>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      </fieldset>

      {!prepared &&
        (wallet.isConnected ? (
          <button
            type="button"
            className="button is-primary is-fullwidth"
            disabled={isCheckingBalance}
            data-test="button_deposit"
            onClick={onPreDeposit}
          >
            {t('depositButton')}
          </button>
        ) : (
          <ConnectButton className="is-primary is-fullwidth" />
        ))}

      {insufficientBalance && (
        <BalanceModal
          currency={insufficientBalance.currency}
          balance={insufficientBalance.balance}
          onClose={() => setInsufficientBalance(null)}
        />
      )}

      {riskRequest && (
        <TokenRiskModal
          symbol={getSymbol(riskRequest.netId, riskRequest.currency)}
          onClose={() => setRiskRequest(null)}
          onContinue={() => {
            const request = riskRequest
            setRiskRequest(null)
            if (isRequestCurrent(request)) void onDeposit()
          }}
        />
      )}

      {approvalRequest && (
        <ApproveTokenModal
          symbol={getSymbol(approvalRequest.netId, approvalRequest.currency)}
          amount={approvalRequest.amount}
          isApproving={isApproving}
          error={approvalError}
          onApprove={onApproveToken}
          onClose={() => {
            if (!isApproving) {
              setApprovalRequest(null)
              setApprovalError('')
            }
          }}
        />
      )}

      {prepared && (
        <DepositModal
          prefix={prepared.prefix}
          note={prepared.note}
          copyLabel={copyLabel}
          isBackedUp={isBackedUp}
          onToggleBackedUp={setIsBackedUp}
          isEncrypted={isEncrypted}
          onToggleEncrypted={setIsEncrypted}
          isSending={isSending}
          onCopyNote={onCopyNote}
          onSaveNote={onSaveNote}
          onSendDeposit={onSendDeposit}
          onClose={() => setPrepared(null)}
        />
      )}

      {error && <p className="help is-danger">{error}</p>}
    </div>
  )
}

export default DepositTab
