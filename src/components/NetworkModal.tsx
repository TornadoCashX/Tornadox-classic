import { useTranslation } from 'react-i18next'

import { getAllNetworks, getNetworkIconSlug } from '@/lib/networkHelpers'

import Modal from './Modal'
import { TrndIcon } from './Icon'
import './NetworkModal.scss'

// Ports components/NetworkModal.vue, which classic opens via $buefy.modal.open() from the
// navbar's network button with no canCancel override, so it takes Buefy's default.
const NetworkModal = ({
  netId,
  onSelect,
  onClose
}: {
  netId: number
  onSelect: (netId: number) => void
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const networks = getAllNetworks()

  return (
    <Modal
      centeredTitle
      title={t('changeNetwork')}
      onClose={onClose}
      cardClassName="is-wallet-modal network-modal-card"
    >
      <div className="networks">
        {networks.map(({ name, chainId, dataTest }) => (
          <button
            type="button"
            key={chainId}
            className={`item ${chainId === netId ? 'is-active' : ''}`}
            data-test={dataTest}
            onClick={() => onSelect(chainId)}
          >
            <TrndIcon name={getNetworkIconSlug(chainId)} className="network-icon" />
            <b>{name}</b>
            <span className="network-checkbox" />
          </button>
        ))}
      </div>
    </Modal>
  )
}

export default NetworkModal
