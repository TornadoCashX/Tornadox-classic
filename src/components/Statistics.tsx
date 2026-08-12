import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAppContext } from '@/context/AppContext'
import { useStatistic } from '@/context/StatisticContext'
import { getSymbol } from '@/lib/networkHelpers'
import { ensureRpcSelected } from '@/lib/rpcSelect'
import { getNextDepositIndex } from '@/lib/contracts'
import { getEventsFactory } from '@/services/events'
import { formatPipePlural } from '@/utils/i18nFormat'
import { buildLatestDepositsFromEvents } from '@/services/statistics'
import { ensureRuntimeConfigured } from '@/runtime'
import { formatRelativeTime } from '@/utils/dateTime'

import { BgIcon } from './Icon'
import Tooltip from './Tooltip'

const Statistics = () => {
  const { t, i18n } = useTranslation()
  const { netId, selectedCurrency, selectedAmount } = useAppContext()
  const { setNextDepositIndex } = useStatistic()
  const [isLoading, setIsLoading] = useState(true)
  const [anonymitySet, setAnonymitySet] = useState<number | null>(null)
  const [latestDeposits, setLatestDeposits] = useState<Array<{ index: number; depositTime: string }> | null>(
    null
  )
  const requestId = useRef(0)

  useEffect(() => {
    const currentRequest = ++requestId.current
    setIsLoading(true)

    const run = async () => {
      try {
        await ensureRuntimeConfigured(netId)
        const rpcUrl = await ensureRpcSelected(netId)
        const eventsInterface = getEventsFactory(rpcUrl)
        const service = eventsInterface.getService({ netId, amount: selectedAmount, currency: selectedCurrency })

        const [nextDepositIndex, graphEvents] = await Promise.all([
          getNextDepositIndex(netId, selectedCurrency, selectedAmount),
          service.getEventsFromGraph({ methodName: 'getStatistic' })
        ])

        if (currentRequest !== requestId.current) return

        setAnonymitySet(nextDepositIndex)
        // Mirrors classic's updateSelectEvents also committing SAVE_LAST_INDEX into the same
        // shared statistic state it reads from elsewhere - keeps the StatisticContext cache
        // fresh for this pool immediately, instead of only the bulk Multicall load ever touching it.
        setNextDepositIndex(selectedCurrency, selectedAmount, nextDepositIndex)
        setLatestDeposits(
          buildLatestDepositsFromEvents({
            events: graphEvents?.events || [],
            formatTimeAgo: (timestamp: number) => formatRelativeTime(timestamp, i18n.resolvedLanguage)
          })
        )
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Statistics update failed:', err)
      } finally {
        if (currentRequest === requestId.current) setIsLoading(false)
      }
    }

    run()
  }, [netId, selectedCurrency, selectedAmount, i18n.resolvedLanguage])

  const symbol = getSymbol(netId, selectedCurrency)
  const firstColumn = (latestDeposits || []).slice(0, 5)
  const secondColumn = (latestDeposits || []).slice(5, 10)

  return (
    <div className="column is-half">
      <div className="box-stats">
        <div className="tab-with-corner is-left-top">
          {t('statistics')}
          <span className="selected">
            {selectedAmount} {symbol}
          </span>
        </div>
        <div className="box">
          <div className="label">
            {t('anonymitySet')}{' '}
            <Tooltip
              className="is-primary is-top is-medium is-multiline"
              trigger={
                <button className="button is-primary has-icon">
                  <BgIcon name="info" />
                </button>
              }
            >
              {t('anonymitySetTooltip')}
            </Tooltip>
          </div>
          <div className="field">
            {!isLoading && anonymitySet !== null ? (
              <span>
                {anonymitySet > 1 && anonymitySet < 5 ? `${t('only')} ` : ''}
                {anonymitySet > 1 && <b>{anonymitySet} </b>}
                {formatPipePlural(t('equalUserDepositPlural'), anonymitySet)}
              </span>
            ) : (
              <span className="skeleton is-large" style={{ width: 200 }} />
            )}
          </div>
          {!isLoading && anonymitySet !== 0 && (
            <>
              <div className="label">{t('latestDeposits')}</div>
              {latestDeposits && latestDeposits.length ? (
                <div className="columns is-small is-multiline">
                  <div className="column is-half-small">
                    <div className="deposits">
                      {firstColumn.map(({ index, depositTime }) => (
                        <div key={index} className="row">
                          <div className="value">{index + 1}.</div>
                          <div className="data">{depositTime}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="column is-half-small">
                    <div className="deposits">
                      {secondColumn.map(({ index, depositTime }) => (
                        <div key={index} className="row">
                          <div className="value">{index + 1}.</div>
                          <div className="data">{depositTime}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="field">-</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default Statistics
