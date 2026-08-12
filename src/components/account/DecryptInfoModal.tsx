import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { useAppContext } from '@/context/AppContext'
import { useAccountContext } from '@/context/AccountContext'
import { getSymbol } from '@/lib/networkHelpers'
import Modal from '@/components/Modal'

// Ports modules/account/modals/DecryptInfo.vue.
const DecryptInfoModal = ({
  spent,
  unSpent,
  onClose
}: {
  spent: number
  unSpent: number
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { netId } = useAppContext()
  const { statistic } = useAccountContext()

  const balanceByCurrency = statistic.reduce<Record<string, Record<string, number>>>(
    (acc, { currency, amount }) => {
      const key = String(amount)
      acc[currency] = { ...acc[currency], [key]: (acc[currency]?.[key] || 0) + 1 }
      return acc
    },
    {}
  )

  return (
    <Modal isPinned title={t('account.modals.decryptInfo.title')} onClose={onClose}>
      <div className="note">{t('account.modals.decryptInfo.description')}</div>
      <div className="account-decrypt-info">
        <div className="item">
          {t('account.modals.decryptInfo.spent')}
          <span className="has-text-weight-bold mr-3">{spent}</span>
        </div>
        <div className="item">
          {t('account.modals.decryptInfo.unSpent')}
          <span className="has-text-weight-bold mr-3">{unSpent}</span>
        </div>
        {Object.entries(balanceByCurrency).map(([currency, instances]) =>
          Object.entries(instances).map(([instance, count]) => (
            <div key={`${currency}_${instance}`} className="item">
              {instance} {getSymbol(netId, currency)}:
              <span className="has-text-weight-bold mr-3">{count}</span>
            </div>
          ))
        )}
      </div>
      <div className="buttons buttons__halfwidth mt-3">
        <button
          type="button"
          className="button is-primary is-outlined"
          data-test="button_close_your_note_popup"
          onClick={onClose}
        >
          {t('account.modals.decryptInfo.close')}
        </button>
        <button
          type="button"
          className="button is-primary"
          data-test="button_main_page_your_notes_popup"
          onClick={() => {
            navigate('/')
            onClose()
          }}
        >
          {t('account.modals.decryptInfo.redirect')}
        </button>
      </div>
    </Modal>
  )
}

export default DecryptInfoModal
