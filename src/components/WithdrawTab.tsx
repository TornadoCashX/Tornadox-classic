import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { isAddress, parseUnits } from 'viem'

import { useAppContext } from '@/context/AppContext'
import { useLoading } from '@/context/LoadingContext'
import { useNotice } from '@/context/NoticeContext'
import { useRelayerJob } from '@/context/RelayerJobContext'
import { useStatistic } from '@/context/StatisticContext'
import { useTransactions } from '@/context/TransactionsContext'
import { withEventReadRetry } from '@/lib/eventReads'
import { findDepositEvent, isNullifierSpent } from '@/services/depositLookup'
import { createWithdrawalProofFlow, prepareWithdrawalFlow } from '@/services/withdrawFlow'
import { parseNote, validateNote } from '@/utils'
import { formatPipePlural, interpolate } from '@/utils/i18nFormat'
import { formatRelativeTime } from '@/utils/dateTime'
import { getExplorerUrl, getNetworkConfig, getSymbol } from '@/lib/networkHelpers'
import { getInstanceAddress } from '@/lib/contracts'
import { buildTree } from '@/lib/withdraw'
import { buildRelayerTransaction, calculateRelayerFee, calculateRelayerRefund } from '@/lib/relayerFee'
import { getConfiguredRelayer, setupDefaultRelayer } from '@/lib/relayerSetup'
import { getTornadoKeys } from '@/services/runtimeAssets'
import { ensureRuntimeConfigured } from '@/runtime'

import { BgIcon } from './Icon'
import Tooltip from './Tooltip'
import './WithdrawTab.scss'

const relayerDisplayName = (relayer: { name: string }) => relayer.name

// Ports components/icons/LinkIcon.vue - only used here, just as in classic.
const LinkIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 40 40">
    <path
      fill="#94FEBF"
      fillRule="evenodd"
      d="M36 40H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4h8a2 2 0 1 1 0 4H6a2 2 0 0 0-2 2v28a2 2 0 0 0 2 2h28a2 2 0 0 0 2-2v-6a2 2 0 1 1 4 0v8a4 4 0 0 1-4 4zm2-22a2 2 0 0 1-2-2V6.801l-3.601 3.602-6.162 6.162-3.834 3.834-7 7a2.004 2.004 0 0 1-2.833-2.833l7-7L33.136 4H24a2 2 0 1 1 0-4h13.897c.083-.004.161.008.243.014.165.012.324.043.476.093.054.018.107.027.159.049.227.096.431.235.606.403.005.005.012.006.018.011A1.993 1.993 0 0 1 40 2v14a2 2 0 0 1-2 2z"
    />
  </svg>
)

interface DepositStatus {
  timestamp: number
  txHash: string
  amount: string | number
  currency: string
  // null when the on-chain nextIndex lookup that derives it failed - the rest of the note data
  // is still valid and withdrawable, only this one informational row is unavailable.
  depositsPast: number | null
}

const WithdrawTab = () => {
  const { t, i18n } = useTranslation()
  const {
    netId,
    selectedRelayer,
    setSelectedRelayer,
    isLoadingRelayer,
    setIsLoadingRelayer
  } = useAppContext()
  const { recordWithdrawal } = useTransactions()
  const { getNextDepositIndex } = useStatistic()
  const loading = useLoading()
  const notice = useNotice()
  const [withdrawNote, setWithdrawNote] = useState('')
  const [recipient, setRecipient] = useState('')
  const [status, setStatus] = useState<DepositStatus | null>(null)
  const [noteError, setNoteError] = useState('')
  const [isChecking, setIsChecking] = useState(false)
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [withdrawError, setWithdrawError] = useState('')
  // Set when the relayer fee precheck fails. Without it the fee silently stays '0', which makes
  // isNotEnoughTokens below evaluate to false and leaves the Withdraw button enabled - the user
  // would only discover the oracle/RPC problem after paying for proof generation.
  const [hasRelayerFeeError, setHasRelayerFeeError] = useState(false)
  const [keysError, setKeysError] = useState('')
  const [keysProgress, setKeysProgress] = useState(0)
  const [isLoadingKeys, setIsLoadingKeys] = useState(false)
  const [precheckedRelayerFee, setPrecheckedRelayerFee] = useState('0')
  const [isCheckingRelayerFee, setIsCheckingRelayerFee] = useState(false)
  const requestId = useRef(0)
  const relayerFeeRef = useRef('0')
  const relayerRefundRef = useRef('0')
  const relayerRequestId = useRef(0)
  const relayerWithdrawal = useRelayerJob()

  // Mirrors pages/index.vue's tabChanged(1): classic starts downloading the ~11MB SNARK circuit
  // + proving key as soon as the user switches to the Withdraw tab (not lazily on the Withdraw
  // click), so the data is already cached by the time proof generation actually needs it.
  // getTornadoKeys() memoizes internally, so mounting this more than once is safe/cheap.
  useEffect(() => {
    setKeysError('')
    setIsLoadingKeys(true)
    setKeysProgress(0)
    ensureRuntimeConfigured(netId)
      .then(() => getTornadoKeys(setKeysProgress))
      .catch((err: any) => {
        // eslint-disable-next-line no-console
        console.error('getKeys has error:', err.message)
        setKeysError(t('fetchFile'))
        // Mirrors this same catch's notice/addNoticeWithInterval({title:'fetchFile', type:'warning'})
        notice.addNoticeWithInterval({ type: 'warning', title: t('fetchFile') })
      })
      .finally(() => setIsLoadingKeys(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netId, t])

  // Mirrors pages/index.vue's tabChanged(1) + its netId watcher's `if (activeTab === 1)` guard:
  // classic only ever dispatches relayer/setupDefaultRelayer while the Withdraw tab is active -
  // never eagerly on every network switch regardless of tab, which used to surface spurious
  // relayer/RPC connection errors (e.g. "chain is not available on free plan") on chains the
  // user was only ever depositing on.
  useEffect(() => {
    const currentRequest = ++relayerRequestId.current
    setIsLoadingRelayer(true)
    setSelectedRelayer(null)

    ensureRuntimeConfigured(netId)
      .then(() => setupDefaultRelayer(netId))
      .then((relayer) => {
        if (currentRequest !== relayerRequestId.current) return
        setSelectedRelayer(relayer)
        setIsLoadingRelayer(false)
        // Mirrors setupDefaultRelayer's own catch: only when a relayer *was* configured for this
        // chain but failed validation/fetch - not when the chain simply has none configured,
        // which also resolves to null here but via classic's early `if (!url) return null`
        // before its try/catch (and this notice) is ever reached. Faithfully reusing classic's
        // literal, never-translated English string and its `addNotice` (not addNoticeWithInterval)
        // call - the interval it passes is a no-op there too (that action ignores it), so this
        // notice only ever goes away via its own close button, same as classic's.
        if (!relayer && getConfiguredRelayer(netId).url) {
          notice.addNotice({ type: 'warning', title: 'Failed to fetch configured relayer' })
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netId])

  useEffect(() => {
    const currentRequest = ++requestId.current
    setStatus(null)
    setNoteError('')
    setWithdrawError('')

    if (!withdrawNote) return

    const { isValid, errorKey } = validateNote(withdrawNote, netId)
    if (!isValid) {
      setNoteError(t(errorKey))
      return
    }

    const run = async () => {
      setIsChecking(true)
      // Mirrors Withdraw.vue's withdrawNote watcher: classic shows this note lookup entirely
      // through the global loading overlay (loading/enable('gettingTheNoteData') ... loading/
      // disable() in finally), never as inline text next to the note field.
      loading.enable(t('gettingTheNoteData'))
      try {
        await ensureRuntimeConfigured(netId)
        const note = parseNote(withdrawNote)

        const depositEvent = await withEventReadRetry(netId, (eventsInterface) =>
          findDepositEvent({ eventsInterface, note })
        )
        if (!depositEvent) {
          throw new Error(t('thereIsNoRelatedDeposit'))
        }
        const isSpent = await withEventReadRetry(netId, (eventsInterface) =>
          isNullifierSpent({ eventsInterface, note })
        )
        // Only feeds the informational "Subsequent deposits" row: reads the pool's
        // nextDepositIndex out of the shared StatisticContext cache (mirrors classic's Withdraw.vue
        // reading this off already-loaded statistic state) instead of this component's own RPC
        // call - null while the bulk Multicall load hasn't populated this pool yet.
        const nextDepositIndex = getNextDepositIndex(note.currency, note.amount)

        if (currentRequest !== requestId.current) return

        // Mirrors Withdraw.vue's hasErrorNote computed: a spent note is treated as a note
        // error (shown under the input, same slot as invalid-format/wrong-network errors),
        // and - since the withdraw-data panel below only renders when there's no note error -
        // the Amount/Time passed/Subsequent deposits panel is hidden for spent notes too.
        if (isSpent) {
          setNoteError(t('noteHasBeenSpent'))
          // Mirrors the withdrawNote watcher's own notice/addNoticeWithInterval({title:
          // 'noteWasAlreadySpent', type:'warning'}, interval:5000) - fires alongside (not
          // instead of) the inline hasErrorNote text above, which classic's own hasErrorNote
          // computed independently re-derives from the same isSpent flag.
          notice.addNoticeWithInterval({ type: 'warning', title: t('noteWasAlreadySpent') }, 5000)
          return
        }

        setStatus({
          timestamp: depositEvent.timestamp,
          txHash: depositEvent.transactionHash,
          amount: note.amount,
          currency: note.currency,
          depositsPast:
            nextDepositIndex === null ? null : Math.max(0, nextDepositIndex - depositEvent.leafIndex - 1)
        })
      } catch (err: any) {
        if (currentRequest !== requestId.current) return
        setNoteError(t(err.message))
      } finally {
        if (currentRequest === requestId.current) {
          setIsChecking(false)
          loading.disable()
        }
      }
    }

    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withdrawNote, netId, t])

  // V4 (mainnet) needs the fee before proof generation since its gas limit lookup is a fixed
  // table by tx type, not derived from the real tx; V5 (other chains) recalculates the exact
  // fee from the encoded withdrawal transaction inside createWithdrawalProofFlow itself.
  useEffect(() => {
    // Clear stale fee state when the note, chain, or built-in relayer changes.
    setHasRelayerFeeError(false)
    setIsCheckingRelayerFee(false)
    relayerFeeRef.current = '0'
    relayerRefundRef.current = '0'
    setPrecheckedRelayerFee('0')
    if (netId !== 1 || !selectedRelayer) return
    if (!status || noteError || !withdrawNote) return

    const note = parseNote(withdrawNote)
    let cancelled = false

    setIsCheckingRelayerFee(true)
    Promise.resolve()
      .then(async () => {
        const refundInEth = await calculateRelayerRefund(netId, note.currency)
        const tokenPriceInEth = selectedRelayer.ethPrices[note.currency.toLowerCase()]
        const fee = await calculateRelayerFee({
          netId,
          currency: note.currency,
          amount: note.amount,
          feePercent: selectedRelayer.tornadoServiceFee,
          refundInEth,
          tokenPriceInEth
        })
        return { fee, refundInEth }
      })
      .then(({ fee, refundInEth }) => {
        if (cancelled) return
        relayerFeeRef.current = fee
        relayerRefundRef.current = refundInEth
        // Mirrored into state (the ref exists only so the withdrawal callbacks read a fresh
        // value) because isNotEnoughTokens below has to re-render the button when it lands.
        setPrecheckedRelayerFee(fee)
      })
      .catch((err: any) => {
        if (cancelled) return
        // Previously unhandled: this rejects whenever the gas oracle or RPC is unreachable, so it
        // produced an unhandled rejection AND left the flow looking healthy. Surface the real
        // cause in the same slot as other withdrawal errors and block withdrawal.
        // eslint-disable-next-line no-console
        console.error('relayer fee precheck failed', err)
        setHasRelayerFeeError(true)
        setWithdrawError(err?.message || String(err))
      })
      .finally(() => {
        if (!cancelled) setIsCheckingRelayerFee(false)
      })

    return () => {
      cancelled = true
    }
  }, [netId, selectedRelayer, status, noteError, withdrawNote])

  // Ports store/application.js's isNotEnoughTokens getter: when the relayer's fee swallows the
  // whole pool amount (mainnet gas spikes on the small pools), classic blocks the withdrawal
  // with an explanatory tooltip rather than letting the user burn a proof on it. Like classic
  // this is effectively mainnet-only - elsewhere the fee isn't known until createWithdrawalProofFlow
  // computes it mid-withdrawal, so classic's withdrawalFeeViaRelayer is still 0 here too.
  const isNotEnoughTokens = (() => {
    if (!status || precheckedRelayerFee === '0') return false
    try {
      const { decimals } = getNetworkConfig(netId).tokens[status.currency]
      return parseUnits(status.amount.toString(), decimals) < BigInt(precheckedRelayerFee)
    } catch {
      return false
    }
  })()

  const onWithdraw = async () => {
    if (!isAddress(recipient)) {
      setWithdrawError(t('recipientAddressIsInvalid'))
      return
    }
    if (!selectedRelayer) {
      setWithdrawError(t('relayerError'))
      return
    }

    setIsWithdrawing(true)
    setWithdrawError('')
    // Mirrors onWithdraw's own dispatch('loading/enable', {message: generatingProof}) - the one
    // and only loading message classic shows for this whole click-to-proof-ready stretch (tree
    // build included); it never surfaces a separate "gettingTheNoteData"/"building tree" message
    // here (those belong to the withdrawNote watcher above, a different code path).
    loading.enable(t('generatingProof'))
    try {
      await ensureRuntimeConfigured(netId)
      const config = getNetworkConfig(netId)
      const note = parseNote(withdrawNote)

      if (note.currency !== config.nativeCurrency) {
        if (!selectedRelayer.ethPrices[note.currency.toLowerCase()]) {
          throw new Error(`Relayer did not provide a ${getSymbol(netId, note.currency)} price`)
        }
        // Mainnet's V4 fee was prechecked together with this refund; keep the pair consistent.
        // V5 chains build a dummy transaction first, so they calculate a fresh refund here and
        // then recalculate the fee from that same transaction below.
        if (netId !== 1) relayerRefundRef.current = await calculateRelayerRefund(netId, note.currency)
      } else {
        relayerRefundRef.current = '0'
      }

      const { proof, args } = await prepareWithdrawalFlow({
        serializedNote: withdrawNote,
        recipient,
        parseNote,
        isSpent: (note) =>
          withEventReadRetry(netId, (eventsInterface) => isNullifierSpent({ eventsInterface, note })),
        buildTree: (note) =>
          buildTree({
            netId,
            currency: note.currency,
            amount: note.amount,
            commitmentHex: note.commitmentHex,
            invalidRootMessage: t('invalidRoot'),
            missingEventsMessage: t('failedToFetchAllDepositEvents')
          }),
        createProof: async ({ root, tree, recipient: to, note, leafIndex }) => {
          return createWithdrawalProofFlow({
            root,
            note,
            tree,
            recipient: to,
            leafIndex,
            nativeCurrency: config.nativeCurrency,
            selectedRelayer,
            getRelayerFee: () => relayerFeeRef.current,
            ethToReceive: relayerRefundRef.current,
            buildRelayerTransaction: (params) => buildRelayerTransaction({ ...params, netId }),
            calculateRelayerFee: async ({ tx }) => {
              const fee = await calculateRelayerFee({
                netId,
                currency: note.currency,
                amount: note.amount,
                feePercent: selectedRelayer.tornadoServiceFee,
                refundInEth: relayerRefundRef.current,
                tokenPriceInEth: selectedRelayer.ethPrices[note.currency.toLowerCase()],
                tx
              })
              const denomination = parseUnits(note.amount.toString(), config.tokens[note.currency].decimals)
              if (BigInt(fee) > denomination) throw new Error(t('notEnoughTokens'))
              relayerFeeRef.current = fee
            }
          })
        },
        spentMessage: t('noteHasBeenSpent'),
        missingDepositMessage: t('thereIsNoRelatedDeposit')
      })

      loading.changeText(t('relayerIsNowSendingYourTransaction'))
      const fee = relayerFeeRef.current
      let id: string
      try {
        id = await relayerWithdrawal.submit({
          relayerUrl: selectedRelayer.url,
          args,
          proof,
          contract: getInstanceAddress(netId, note.currency, note.amount),
          amount: note.amount,
          currency: note.currency,
          netId
        })
      } catch {
        throw new Error(interpolate(t('relayRequestFailed'), { relayerName: relayerDisplayName(selectedRelayer) }))
      }

      const valueLabel = `${note.amount} ${getSymbol(netId, note.currency)}`
      const noticeId = notice.addNotice({
        type: 'loading',
        title: interpolate(t('withdrawing'), { value: valueLabel }),
        netId
      })

      relayerWithdrawal.trackInBackground(id, {
        onConfirmed: (jobStatus) => {
          recordWithdrawal({ withdrawNote, txHash: jobStatus.txHash, fee, amount: note.amount, currency: note.currency })
          notice.updateNotice(
            noticeId,
            { type: 'success', title: interpolate(t('withdrawnValue'), { value: valueLabel }), txHash: jobStatus.txHash },
            10000
          )
        },
        onFailed: (error) => {
          // eslint-disable-next-line no-console
          console.error('relayer job failed', error)
          notice.updateNotice(noticeId, { type: 'danger', title: t('transactionFailed') })
          notice.addNoticeWithInterval({ type: 'danger', title: t('relayerError') })
        }
      })

      // Mirrors Withdraw.vue's onWithdraw: on success it just emits 'resetWithdraw', which
      // clears the note and recipient fields back to a blank form - no inline success message
      // here; the background transaction notice owns confirmation feedback.
      setWithdrawNote('')
      setRecipient('')
    } catch (err: any) {
      const message = err?.message || String(err)
      setWithdrawError(message)
      notice.addNoticeWithInterval({ type: 'warning', title: message })
    } finally {
      loading.disable()
      setIsWithdrawing(false)
    }
  }

  // Mirrors Withdraw.vue's timePastToRender/notEnoughPassedTime/notEnoughDeposits computed
  // properties, derived straight from `status` rather than kept as separate state.
  const timePassed = status ? formatRelativeTime(status.timestamp, i18n.resolvedLanguage, false) : ''
  const notEnoughPassedTime = status ? Math.floor(Date.now() / 1000) - status.timestamp < 86400 : false
  const notEnoughDeposits = status?.depositsPast !== null && status !== null && status.depositsPast < 5

  // Mirrors Withdraw.vue's local `isLoading` flag: true both while the SNARK proving key
  // downloads (getKeys(), on Withdraw-tab mount) AND while a proof is being generated
  // (onWithdraw) - one flag covering both lifecycles, exactly as classic's single `data() {
  // isLoading }` does, rather than treating the key-download and proof-generation loading
  // states as unrelated.
  const isLoading = isLoadingKeys || isWithdrawing

  // Mirrors Withdraw.vue's isWithdrawDisabled: the "this note/recipient isn't usable yet" tier.
  // Beyond the obvious cases this covers three states web-react used to leave the button live
  // in: an unparseable recipient (classic requires isValidAddress, not just non-empty), relayer
  // discovery still in flight (classic keeps the button in its loading state), and a failed
  // SNARK key download (classic's isFileError), and built-in relayer discovery.
  const isWithdrawDisabled =
    isLoading ||
    isCheckingRelayerFee ||
    isChecking ||
    !status ||
    !!noteError ||
    !isAddress(recipient) ||
    !!keysError ||
    isLoadingRelayer ||
    !selectedRelayer

  // Mirrors isWithdrawalButtonDisable, and shouldTooltipShow/tooltipText: the extra conditions
  // classic explains through a tooltip on the (still rendered) Withdraw button.
  const isWithdrawalButtonDisabled = isWithdrawDisabled || isNotEnoughTokens || hasRelayerFeeError
  const shouldTooltipShow = !isWithdrawDisabled && isNotEnoughTokens
  const tooltipText = t('notEnoughTokens')

  // Mirrors Withdraw.vue's <b-button :outlined="isLoading" :loading="isLoadingRelayers ||
  // isLoading" class="slide-animation" :class="{'slide-animation-active': isLoading}">: while
  // isLoading, the button switches to Bulma's outlined style (assets/styles/components/_button.scss's
  // `.is-primary.is-outlined { background-color: #0e1f17 }` - a near-black background), Buefy's
  // spinner appears, and the slide-animation green fill (WithdrawTab.scss, driven by
  // --width-animation/keysProgress from getTornadoKeys(setKeysProgress) above) becomes clearly
  // visible against that dark background instead of blending into the normal solid-green button -
  // this is what produces the bright-green-growing-across-a-dark-button look during the key
  // download right after switching to the Withdraw tab.
  const withdrawButtonElement = (
    <button
      type="button"
      className={`button is-primary is-fullwidth slide-animation${isLoading ? ' is-outlined slide-animation-active' : ''}${
        isLoading || isLoadingRelayer ? ' is-loading' : ''
      }`}
      style={{ '--width-animation': `${keysProgress}%` } as CSSProperties}
      disabled={isWithdrawalButtonDisabled}
      data-test="button_withdraw"
      onClick={onWithdraw}
    >
      <span>{t('withdrawButton')}</span>
    </button>
  )

  // Buefy's b-tooltip wraps the button, so hovering still surfaces the reason even though the
  // disabled button itself fires no pointer events.
  const withdrawButton = shouldTooltipShow ? (
    <Tooltip className="is-primary is-top is-multiline is-block" trigger={withdrawButtonElement}>
      {tooltipText}
    </Tooltip>
  ) : (
    withdrawButtonElement
  )

  return (
    <div>
      {keysError && (
        <p className="help is-warning">
          <span className="has-text-warning">{t('downloadError')}</span> {keysError}
        </p>
      )}
      <div className="field">
        <div className="label-with-buttons">
          <div className="label">
            <label htmlFor="withdraw-note">{t('note')}</label>{' '}
            <Tooltip trigger={<button className="button is-primary has-icon"><BgIcon name="info" /></button>}>
              {t('noteTooltip')}
            </Tooltip>
          </div>
          {!noteError && status?.txHash && (
            <a
              href={getExplorerUrl(netId).tx + status.txHash}
              target="_blank"
              rel="noopener noreferrer"
              className="button is-icon"
            >
              <Tooltip
                className="is-primary is-left is-small is-multiline"
                trigger={<LinkIcon />}
              >
                {t('depositTransactionOnEtherscan')}
              </Tooltip>
            </a>
          )}
        </div>
        <div className="control is-clearfix">
          <input
            id="withdraw-note"
            className={`input ${!withdrawNote ? '' : noteError ? 'is-warning' : 'is-primary'}`}
            placeholder={t('pleaseEnterYourNote')}
            value={withdrawNote}
            onChange={(e) => setWithdrawNote(e.target.value.trim())}
          />
        </div>
        {noteError && <p className="help is-warning">{noteError}</p>}
      </div>

      {status && !noteError && (
        <div className="field field-withdraw">
          <div className="withdraw-data">
            <div className="withdraw-data-item">
              {t('amount')}
              <span data-test="note_tokens_amount">
                {status.amount} {getSymbol(netId, status.currency)}
              </span>
            </div>
            <div className="withdraw-data-item">
              {t('timePassed')}
              {/* Mirrors Withdraw.vue's :active="notEnoughPassedTime" - Buefy's b-tooltip
                  `active` prop toggles whether hover shows the tooltip at all, it does not
                  force it open; only hovering the low-anonymity value reveals the warning. */}
              {notEnoughPassedTime ? (
                <Tooltip className="is-primary is-left is-small is-multiline" trigger={<span className="has-low-anonymity"><span>{timePassed}</span></span>}>
                  {t('timePassedTooltip')}
                </Tooltip>
              ) : (
                <span>{timePassed}</span>
              )}
            </div>
            <div className="withdraw-data-item">
              {t('subsequentDeposits')}
              {status.depositsPast === null ? (
                <span>-</span>
              ) : notEnoughDeposits ? (
                <Tooltip
                  className="is-primary is-left is-small is-multiline"
                  trigger={
                    <span className="has-low-anonymity">
                      <span>{formatPipePlural(t('userDeposit'), status.depositsPast)}</span>
                    </span>
                  }
                >
                  {t('subsequentDepositsTooltip')}
                </Tooltip>
              ) : (
                <span>{formatPipePlural(t('userDeposit'), status.depositsPast)}</span>
              )}
            </div>
          </div>
        </div>
      )}

      <fieldset>
        <div className="field withdraw-address">
          <div className="label">
            <label htmlFor="withdraw-recipient" className="name">
              {t('recipientAddress')}
            </label>
          </div>
          <div className="control is-clearfix">
            <input
              id="withdraw-recipient"
              className={`input ${!recipient ? '' : isAddress(recipient) ? 'is-primary' : 'is-warning'}`}
              placeholder={t('pleasePasteAddressHere')}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value.trim())}
            />
          </div>
        </div>

        {/* Relayer withdrawal does not require a connected wallet. */}
        {withdrawButton}
      </fieldset>

      {withdrawError && <p className="help is-danger">{withdrawError}</p>}
    </div>
  )
}

export default WithdrawTab
