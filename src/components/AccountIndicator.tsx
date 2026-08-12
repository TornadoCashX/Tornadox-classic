import { useTranslation } from 'react-i18next'

import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useNavigate } from 'react-router-dom'

import { useAppContext } from '@/context/AppContext'
import { useAccountContext } from '@/context/AccountContext'
import { getNetworkConfig, getSymbol } from '@/lib/networkHelpers'
import { sliceAddress } from '@/utils'

import { TrndIcon } from './Icon'
import Tooltip from './Tooltip'

// Ports modules/account/components/Indicator/Indicator.vue - the navbar wallet-icon slot
// reserved (previously always "Not connected") for the Note Account feature.
const AccountIndicator = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { netId } = useAppContext()
  const { isSetupAccount, addresses, statistic, highlightNoteAccount } = useAccountContext()
  const { copy, label: copyLabel } = useCopyToClipboard()

  // Mirrors classic's noteAccountBalance getter: native-currency balance only.
  const nativeCurrency = getNetworkConfig(netId).nativeCurrency
  const balance = statistic
    .filter(({ currency }) => currency === nativeCurrency)
    .reduce((sum, { amount }) => sum + Number(amount), 0)

  return (
    <Tooltip
      className="is-dark-tooltip is-bottom is-medium"
      trigger={
        <button type="button" className={`button is-nav-icon ${isSetupAccount ? 'tornado' : ''}`}>
          <TrndIcon name="wallet" />
        </button>
      }
    >
      {isSetupAccount && addresses ? (
        <>
          <p>{t('accountConnected')}</p>
          <a onClick={() => addresses && copy(addresses.encrypt)}>
            {copyLabel || sliceAddress(addresses.encrypt)}
          </a>
          {balance > 0 && (
            <p>
              {balance} {getSymbol(netId, nativeCurrency)}
            </p>
          )}
        </>
      ) : (
        <>
          <p>{t('notConnected')}</p>
          <button
            type="button"
            className="button is-primary-link mb-0"
            onClick={() => {
              highlightNoteAccount(true)
              navigate('/account')
            }}
          >
            {t('connectAccount')}
          </button>
        </>
      )}
    </Tooltip>
  )
}

export default AccountIndicator
