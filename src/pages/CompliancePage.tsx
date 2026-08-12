import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAppContext } from '@/context/AppContext'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { withEventReadRetry } from '@/lib/eventReads'
import {
  buildWithdrawalReport,
  findDepositEvent,
  findWithdrawalEvent,
  isNullifierSpent
} from '@/services/depositLookup'
import { hashRender, parseNote, validateNote } from '@/utils'
import { formatUtcDate } from '@/utils/dateTime'

import { getBlock, getTransactionReceipt } from '../lib/contracts'
import { getExplorerUrl, getNetworkConfig, getSymbol } from '../lib/networkHelpers'
import { ensureRuntimeConfigured } from '../runtime'

interface DepositInfo {
  amount: string | null
  currency: string
  isSpent: boolean
  timestamp: number | null
  txHash: string
  from: string
  commitment?: string
}

interface WithdrawalInfo {
  amount: string | null
  txHash: string
  timestamp: number | null
  to: string
  nullifier: string
  fee: string | null
}

const emptyDeposit: DepositInfo = {
  amount: null,
  currency: '',
  isSpent: false,
  timestamp: null,
  txHash: '',
  from: ''
}

const emptyWithdrawal: WithdrawalInfo = {
  amount: null,
  txHash: '',
  timestamp: null,
  to: '',
  nullifier: '',
  fee: null
}

// Splits `{newline}`-delimited translation strings (vue-i18n's <i18n path> interpolation
// slot in the original app) into paragraphs joined by <br/>, matching the Vue rendering.
const NewlineText = ({ i18nKey }: { i18nKey: string }) => {
  const { t } = useTranslation()
  const parts = t(i18nKey).split('{newline}')

  return (
    <>
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {index < parts.length - 1 && <br />}
        </span>
      ))}
    </>
  )
}

const CompliancePage = () => {
  const { t, i18n } = useTranslation()
  const { netId } = useAppContext()
  const { copy } = useCopyToClipboard()
  const [withdrawNote, setWithdrawNote] = useState('')
  const [error, setError] = useState<{ type: string; msg: string }>({ type: '', msg: '' })
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [txDepositInfo, setTxDepositInfo] = useState<DepositInfo>(emptyDeposit)
  const [txWithdrawalInfo, setTxWithdrawalInfo] = useState<WithdrawalInfo>(emptyWithdrawal)
  const requestId = useRef(0)

  useEffect(() => {
    const currentRequest = ++requestId.current
    setLoaded(false)
    setError({ type: '', msg: '' })
    setTxDepositInfo(emptyDeposit)
    setTxWithdrawalInfo(emptyWithdrawal)

    if (!withdrawNote) {
      return
    }

    const run = async () => {
      setLoading(true)
      try {
        await ensureRuntimeConfigured(netId)

        const [, currency, amount] = withdrawNote.split('-')
        const { isValid, errorKey } = validateNote(withdrawNote, netId)
        if (!isValid) {
          throw new Error(errorKey)
        }

        const note = parseNote(withdrawNote)

        const depositEvent = await withEventReadRetry(netId, (eventsInterface) =>
          findDepositEvent({ eventsInterface, note })
        )
        if (!depositEvent) {
          throw new Error('thereIsNoRelatedDeposit')
        }

        const isSpent = await withEventReadRetry(netId, (eventsInterface) =>
          isNullifierSpent({ eventsInterface, note })
        )
        const receipt = await getTransactionReceipt(netId, depositEvent.transactionHash)

        if (currentRequest !== requestId.current) return

        setTxDepositInfo({
          currency,
          amount,
          isSpent,
          txHash: depositEvent.transactionHash,
          timestamp: depositEvent.timestamp,
          from: receipt?.from ?? '',
          commitment: note.commitmentHex
        })

        if (isSpent) {
          const withdrawalEvent = await withEventReadRetry(netId, (eventsInterface) =>
            findWithdrawalEvent({ eventsInterface, note })
          )
          if (withdrawalEvent) {
            const decimals = getNetworkConfig(netId).tokens[currency].decimals
            const report = buildWithdrawalReport({ event: withdrawalEvent, amount, decimals })
            const block = await getBlock(netId, report.withdrawalBlock)

            if (currentRequest !== requestId.current) return

            setTxWithdrawalInfo({
              amount: report.amount,
              txHash: report.txHash,
              timestamp: Number(block.timestamp),
              to: report.to ?? '',
              nullifier: note.nullifierHex,
              fee: report.fee
            })
          }
        }

        setLoaded(true)
      } catch (e: any) {
        if (currentRequest !== requestId.current) return
        // eslint-disable-next-line no-console
        console.error(e)
        setError({ type: 'is-warning', msg: t(e.message) })
      } finally {
        if (currentRequest === requestId.current) setLoading(false)
      }
    }

    run()
  }, [withdrawNote, netId, t])

  const render = (hash: string) => hashRender(hash, 20, '..')

  const onCopy = (value?: string) => {
    if (!value) return
    void copy(value)
  }

  const txExplorerUrl = (txHash: string) => getExplorerUrl(netId).tx + txHash
  const addressExplorerUrl = (address: string) => getExplorerUrl(netId).address + address

  const formatDate = (timestamp: number | null) =>
    timestamp ? formatUtcDate(timestamp, i18n.resolvedLanguage) : '-'

  // jsPDF is ~350kB and only ever runs when the user clicks Print on a loaded report, so it is
  // pulled in on demand rather than bundled into the initial page load. Awaiting inside the
  // handler keeps the call site otherwise identical.
  const print = async () => {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF() as any

    doc.setFontSize(9).setLineHeightFactor(1.5).setFont('courier', 'normal')

    const width = doc.internal.pageSize.getWidth()
    const padding = 10
    const endX = width - padding
    const splitLineSize = width - padding * 2
    const splitColumnSize = (width - padding * 3) / 2
    const endFirstColumnX = splitColumnSize + padding
    const startSecondColumnX = splitColumnSize + padding * 2

    const symbol = getSymbol(netId, txDepositInfo.currency)
    const depositAmount = `${txDepositInfo.amount} ${symbol}`
    const withdrawalAmount = `${txWithdrawalInfo.amount} ${symbol}`
    const fee = `${t('relayerFee')} ${txWithdrawalInfo.fee} ${symbol}`

    const depositDate = txDepositInfo.timestamp
      ? formatUtcDate(txDepositInfo.timestamp, i18n.resolvedLanguage)
      : '-'
    const withdrawDate = txWithdrawalInfo.timestamp
      ? formatUtcDate(txWithdrawalInfo.timestamp, i18n.resolvedLanguage)
      : '-'

    const depositTx = doc.splitTextToSize(txDepositInfo.txHash, splitColumnSize)
    const withdrawTx = doc.splitTextToSize(txWithdrawalInfo.txHash, splitColumnSize)
    const commitment = doc.splitTextToSize(txDepositInfo.commitment ?? '', splitColumnSize)
    const nullifier = doc.splitTextToSize(txWithdrawalInfo.nullifier, splitColumnSize)
    const note = doc.splitTextToSize(withdrawNote, splitLineSize)
    const complianceWarning = doc.splitTextToSize(
      t('compliancePrintWarning').replace(/\{newline\}/g, '\n'),
      splitLineSize
    )

    doc.text(t('note'), padding, 50)
    doc.text(t('date'), padding, 91)
    doc.text(t('date'), startSecondColumnX, 91)
    doc.text(t('transaction'), padding, 106)
    doc.text(t('transaction'), startSecondColumnX, 106)
    doc.text(t('from'), padding, 126)
    doc.text(t('to'), startSecondColumnX, 126)
    doc.text(t('commitment'), padding, 141)
    doc.text(t('nullifierHash'), startSecondColumnX, 141)
    doc.text(complianceWarning, padding, 209)

    doc.setFont('courier', 'bold').text(note, padding, 56)
    doc.text(depositDate, padding, 97)
    doc.text(withdrawDate, startSecondColumnX, 97)

    const links = [
      { text: depositTx, x: padding, y: 112, url: txExplorerUrl(txDepositInfo.txHash) },
      { text: withdrawTx, x: startSecondColumnX, y: 112, url: txExplorerUrl(txWithdrawalInfo.txHash) },
      { text: txDepositInfo.from, x: padding, y: 132, url: addressExplorerUrl(txDepositInfo.from) },
      {
        text: txWithdrawalInfo.to,
        x: startSecondColumnX,
        y: 132,
        url: addressExplorerUrl(txWithdrawalInfo.to)
      }
    ]

    for (const { text, x, y, url } of links) {
      if (Array.isArray(text)) {
        text.forEach((line: string, i: number) => doc.textWithLink(line, x, y + i * 4.8, { url }))
      } else {
        doc.textWithLink(text, x, y, { url })
      }
    }

    doc.text(commitment, padding, 147)
    doc.text(nullifier, startSecondColumnX, 147)

    doc.setFontSize(20).text('Tornado Cash', padding, 40)
    doc.setFont('courier', 'normal').text(t('complianceReport'), 65, 40)

    doc.setFontSize(8).text(t('verified'), padding, 81)
    doc.text(t('verified'), startSecondColumnX, 81)
    doc.text(fee, endX, 81, { align: 'right' })

    doc.setFontSize(14).text(t('deposit'), padding, 75)
    doc.text(t('withdrawal'), startSecondColumnX, 75)
    doc.text(t('warning'), padding, 200)
    doc.setFont('courier', 'bold').text(depositAmount, endFirstColumnX, 75, { align: 'right' })
    doc.text(withdrawalAmount, endX, 75, { align: 'right' })

    doc.save(`tornadocash-compliance-${txDepositInfo.currency}-${txDepositInfo.amount}.pdf`)
  }

  const showResult = withdrawNote && error.msg === ''
  const symbol = txDepositInfo.currency ? getSymbol(netId, txDepositInfo.currency) : ''

  return (
    <div className="compliance">
      <h1 className="title is-size-1 is-size-2-mobile is-spaced">
        Tornado Cash <span className="not-print">{t('complianceTool')}</span>
        <span className="print">{t('complianceReport')}</span>
      </h1>
      <p className="p is-size-6">
        <NewlineText i18nKey="complianceSubtitle" />
      </p>

      <div className="field">
        <label className="label" htmlFor="compliance-note">
          {t('note')}
        </label>
        <input
          id="compliance-note"
          className={`input compliance-note-input ${error.msg ? error.type : ''}`}
          name="complianceNote"
          data-test="input_enter_note_for_compliance"
          placeholder={t('pleaseEnterYourNote')}
          value={withdrawNote}
          onChange={(e) => setWithdrawNote(e.target.value.trim())}
        />
        <div className="print-help">{withdrawNote}</div>
        {error.msg !== '' && (
          <p className={`help ${error.type}`}>{loading ? t('gettingTheNoteData') : error.msg}</p>
        )}
      </div>

      {showResult && (
        <div>
          {!txDepositInfo.isSpent && loaded && (
            <div className="notification main-notification is-warning" data-icon>
              <strong>{t('warning')}</strong> {t('doNotShareYouNote')}
            </div>
          )}

          <div className="columns columns-blocks is-desktop is-gapless">
            <div className="column is-5-desktop">
              <div className="block">
                <h3 className="block-item block-item--title">
                  {t('deposit')}
                  <span>{txDepositInfo.amount ? `${txDepositInfo.amount} ${symbol}` : '-'}</span>
                </h3>
                <div
                  className={`block-item block-item--status ${txDepositInfo.txHash ? 'is-success' : ''}`}
                  data-test="note_status_info"
                >
                  {txDepositInfo.txHash ? t('verified') : t('status')}
                </div>
                <div className="block-item block-item--data">
                  <div className="label">{t('date')}</div>
                  <div className="value">{formatDate(txDepositInfo.timestamp)}</div>
                </div>
                <div className="block-item block-item--data">
                  <div className="label">{t('transaction')}</div>
                  {txDepositInfo.txHash ? (
                    <a
                      href={txExplorerUrl(txDepositInfo.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="value"
                    >
                      {render(txDepositInfo.txHash)}
                    </a>
                  ) : (
                    <div className="value">-</div>
                  )}
                </div>
                <div className="block-item block-item--data">
                  <div className="label">{t('from')}</div>
                  {txDepositInfo.txHash ? (
                    <a
                      href={addressExplorerUrl(txDepositInfo.from)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="value"
                    >
                      {txDepositInfo.from}
                    </a>
                  ) : (
                    <div className="value">-</div>
                  )}
                </div>
                <div className="block-item block-item--data">
                  <div className="label">{t('commitment')}</div>
                  {txDepositInfo.commitment ? (
                    <div
                      className="value copy"
                      onClick={() => onCopy(txDepositInfo.commitment)}
                      role="button"
                      tabIndex={0}
                    >
                      {render(txDepositInfo.commitment)}
                    </div>
                  ) : (
                    <div className="value">-</div>
                  )}
                </div>
              </div>
            </div>
            <div className="column is-2-desktop">
              <div className="arrow" />
            </div>
            <div className="column is-5-desktop">
              <div className="block block-withdrawal">
                <h3 className="block-item block-item--title">
                  {t('withdrawal')}
                  <span>{txWithdrawalInfo.amount ? `${txWithdrawalInfo.amount} ${symbol}` : '-'}</span>
                </h3>
                <div
                  className={`block-item block-item--status ${!txDepositInfo.isSpent ? 'is-warning' : ''} ${
                    txWithdrawalInfo.txHash ? 'is-success' : ''
                  }`}
                  data-test="info_withdrawal_status"
                >
                  {txDepositInfo.isSpent
                    ? txWithdrawalInfo.txHash
                      ? t('verified')
                      : t('status')
                    : t('noteHasNotBeenSpent')}
                  <span className="fee">
                    {txWithdrawalInfo.fee ? `${t('relayerFee')} ${txWithdrawalInfo.fee} ${symbol}` : t('relayerFee')}
                  </span>
                </div>
                <div className="block-item block-item--data">
                  <div className="label">{t('date')}</div>
                  <div className="value">{formatDate(txWithdrawalInfo.timestamp)}</div>
                </div>
                <div className="block-item block-item--data">
                  <div className="label">{t('transaction')}</div>
                  {txWithdrawalInfo.txHash ? (
                    <a
                      href={txExplorerUrl(txWithdrawalInfo.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="value"
                    >
                      {render(txWithdrawalInfo.txHash)}
                    </a>
                  ) : (
                    <div className="value">-</div>
                  )}
                </div>
                <div className="block-item block-item--data">
                  <div className="label">{t('to')}</div>
                  {txWithdrawalInfo.to ? (
                    <a
                      href={addressExplorerUrl(txWithdrawalInfo.to)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="value"
                    >
                      {txWithdrawalInfo.to}
                    </a>
                  ) : (
                    <div className="value">-</div>
                  )}
                </div>
                <div className="block-item block-item--data">
                  <div className="label">{t('nullifierHash')}</div>
                  {txWithdrawalInfo.nullifier ? (
                    <div
                      className="value copy"
                      onClick={() => onCopy(txWithdrawalInfo.nullifier)}
                      role="button"
                      tabIndex={0}
                    >
                      {render(txWithdrawalInfo.nullifier)}
                    </div>
                  ) : (
                    <div className="value">-</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="columns is-desktop is-vcentered is-gapless has-verified">
            <div className="column is-5-desktop" />
            <div className="column is-2-desktop generate-container">
              {txDepositInfo.txHash && txWithdrawalInfo.txHash && (
                <button type="button" className="button is-primary generate is-outlined" onClick={print}>
                  {t('generatePdfReport')}
                </button>
              )}
            </div>
            <div className="column is-5-desktop" />
          </div>
        </div>
      )}

      <div className="print print-title">{t('warning')}</div>
      <div className="print print-p">
        <NewlineText i18nKey="compliancePrintWarning" />
      </div>
    </div>
  )
}

export default CompliancePage
