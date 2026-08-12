import { useTranslation } from 'react-i18next'

import ConfirmDialog from '@/components/ConfirmDialog'

// Ports modules/account/modals/index.js's openRemoveAccountModal - a Buefy
// DialogProgrammatic.confirm(), so there is no .vue component to mirror.
const RemoveAccountConfirm = ({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) => {
  const { t } = useTranslation()

  return (
    <ConfirmDialog
      isPinned
      title={t('account.modals.removeAccount.title')}
      message={t('account.modals.removeAccount.description')}
      cancelText={t('account.modals.removeAccount.cancel')}
      confirmText={t('account.modals.removeAccount.remove')}
      onCancel={onClose}
      onConfirm={onConfirm}
    />
  )
}

export default RemoveAccountConfirm
