import { useTranslation } from 'react-i18next'

import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'

import { useAppContext } from '@/context/AppContext'
import { useAccountContext } from '@/context/AccountContext'
import { sliceAddress } from '@/utils'

import { BgIcon } from './Icon'
import Tooltip from './Tooltip'
import ConnectButton from './ConnectButton'
import Modal from './Modal'

// Ports components/DepositModalBox.vue, which classic opens via $buefy.modal.open() from
// Deposit.vue's "Deposit" button (customClass: 'is-pinned', canCancel: false - no
// backdrop-click/escape dismissal, only the explicit close button) - this app renders it as a
// plain conditional overlay instead of using Buefy's Modal component.
const DepositModal = ({
  prefix,
  note,
  copyLabel,
  isBackedUp,
  onToggleBackedUp,
  isEncrypted,
  onToggleEncrypted,
  isSending,
  onCopyNote,
  onSaveNote,
  onSendDeposit,
  onClose
}: {
  prefix: string
  note: string
  copyLabel: string
  isBackedUp: boolean
  onToggleBackedUp: (value: boolean) => void
  isEncrypted: boolean
  onToggleEncrypted: (value: boolean) => void
  isSending: boolean
  onCopyNote: () => void
  onSaveNote: () => void
  onSendDeposit: () => void
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const { wallet } = useAppContext()
  const { isSetupAccount, addresses, isEnabledSaveFile } = useAccountContext()
  const { copy, label: addressCopyLabel } = useCopyToClipboard()

  const onCopyAccountAddress = () => {
    if (!addresses) return
    copy(addresses.encrypt)
  }

  const [iEncryptedPrefix, iEncryptedSuffix] = t('iEncryptedTheNote').split('{address}')

  // Mirrors DepositModalBox.vue's disableButton: two independent paths to enabling "Send
  // Deposit" - a manual backup confirmation, or having an active account with on-chain
  // encryption left checked.
  const canSend = isBackedUp || (isSetupAccount && isEncrypted)

  return (
    <Modal isPinned canCancel={false} focusFirstControl={false} title={t('yourNote')} onClose={onClose}>
      <div className="note">
        <div>{t('pleaseBackupYourNote')}</div>
        <div>{t('treatYourNote')}</div>
      </div>
      <div className="znote">
        {prefix}-{note}{' '}
        <Tooltip
          className="is-primary is-top is-medium"
          trigger={
            <button type="button" className="button is-primary has-icon" onClick={onCopyNote}>
              <BgIcon name="copy" />
            </button>
          }
        >
          {copyLabel || t('clickToCopy')}
        </Tooltip>{' '}
        <Tooltip
          className="is-primary is-top is-medium"
          trigger={
            <button type="button" className="button is-primary has-icon" onClick={onSaveNote}>
              <BgIcon name="save" />
            </button>
          }
        >
          {t('saveNote')}
        </Tooltip>
      </div>
      {/* Mirrors DepositModalBox.vue's `v-show="isEnabledSaveFile"`: this line names the file
              the note was *automatically* downloaded as, so it only makes sense while that
              account switch is on (prepareDeposit only schedules the backup in that case). */}
      {isEnabledSaveFile && (
        <div className="note">
          {t('saveAsFile')}{' '}
          <span className="has-text-primary">{`backup-${prefix}-${note.slice(0, 10)}.txt`}</span>
        </div>
      )}
      {isSetupAccount && addresses ? (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={isEncrypted}
            onChange={(e) => onToggleEncrypted(e.target.checked)}
          />{' '}
          {iEncryptedPrefix}
          <Tooltip
            className="is-primary is-top is-medium"
            trigger={<a onClick={onCopyAccountAddress}>{sliceAddress(addresses.encrypt)}</a>}
          >
            {addressCopyLabel || t('clickToCopy')}
          </Tooltip>
          {iEncryptedSuffix}
        </label>
      ) : (
        <div className="notice warning">{t('yourDontHaveAccount')}</div>
      )}

      {(!isSetupAccount || !isEncrypted) && (
        <label className="checkbox" data-test="backup_note_checkbox">
          <input type="checkbox" checked={isBackedUp} onChange={(e) => onToggleBackedUp(e.target.checked)} />{' '}
          {t('iBackedUpTheNote')}
        </label>
      )}

      {!wallet.isConnected ? (
        <ConnectButton className="is-primary is-fullwidth" />
      ) : (
        <button
          type="button"
          className="button is-primary is-fullwidth"
          disabled={!canSend || isSending}
          data-test="send_deposit_button"
          onClick={onSendDeposit}
        >
          {isSending ? t('preparingTransactionData') : t('sendDeposit')}
        </button>
      )}
    </Modal>
  )
}

export default DepositModal
