import { type ReactNode } from 'react'

import Modal from './Modal'

// Ports Buefy's DialogProgrammatic.confirm(), which classic uses for the two prompts that have
// no .vue component of their own: removing a Note Account (modules/account/modals/index.js's
// openRemoveAccountModal) and re-pairing WalletConnect on another chain (store/metamask.js's
// networkChangeHandler). Both are a title + message + cancel/confirm pair, so they shared the
// same hand-written markup twice over; this is that markup once.
const ConfirmDialog = ({
  title,
  message,
  cancelText,
  confirmText,
  onCancel,
  onConfirm,
  isPinned = false,
  portal = false,
  closeDataTest,
  confirmDataTest
}: {
  title: ReactNode
  message: ReactNode
  cancelText: ReactNode
  confirmText: ReactNode
  onCancel: () => void
  onConfirm: () => void
  isPinned?: boolean
  portal?: boolean
  closeDataTest?: string
  confirmDataTest?: string
}) => (
  <Modal title={title} onClose={onCancel} isPinned={isPinned} portal={portal} closeDataTest={closeDataTest}>
    <div className="note">{message}</div>
    <div className="buttons buttons__halfwidth mt-3">
      <button type="button" className="button is-primary is-outlined" onClick={onCancel}>
        {cancelText}
      </button>
      <button type="button" className="button is-primary" data-test={confirmDataTest} onClick={onConfirm}>
        {confirmText}
      </button>
    </div>
  </Modal>
)

export default ConfirmDialog
