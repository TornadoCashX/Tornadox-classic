import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useModalBehavior } from '@/hooks/useModalBehavior'

// Ports modules/account/modals/SessionUpdate.vue - the idle-timeout follow-up dialog. Shows a
// "still there?" confirm first; if untouched for a further 60s, auto-fires onCancel and swaps to
// a terminated-session message with just a Close button.
const SessionUpdateModal = ({
  onCancel,
  onConfirm,
  onClose
}: {
  onCancel: () => void
  onConfirm: () => void
  onClose: () => void
}) => {
  const { t } = useTranslation()
  // modals/index.js's openConfirmModal passes no canCancel -> Buefy's default.
  const { onBackdropClick } = useModalBehavior(onClose)
  const [isShow, setIsShow] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      onCancel()
      setIsShow(true)
    }, 60 * 1000)
    return () => clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="modal is-active is-pinned">
      <div className="modal-background" onClick={onBackdropClick} />
      <div className="animation-content">
        <div className="modal-card">
          <header className="modal-card-head">
            <div className="modal-card-title">{t('account.modals.checkRecoveryKey.title')}</div>
          </header>
          <section className="modal-card-body">
            <div className="media">
              <div className="media-content">
                {isShow
                  ? t('account.modals.checkRecoveryKey.inactiveDescription')
                  : t('account.modals.checkRecoveryKey.description')}
              </div>
            </div>
          </section>
          {isShow ? (
            <footer className="modal-card-foot">
              <button type="button" className="button is-primary is-outlined" onClick={onClose}>
                {t('close')}
              </button>
            </footer>
          ) : (
            <footer className="modal-card-foot">
              <button
                type="button"
                className="button is-primary is-outlined"
                onClick={() => {
                  onCancel()
                  onClose()
                }}
              >
                {t('account.modals.checkRecoveryKey.no')}
              </button>
              <button
                type="button"
                className="button is-primary"
                onClick={() => {
                  onConfirm()
                  onClose()
                }}
              >
                {t('account.modals.checkRecoveryKey.yes')}
              </button>
            </footer>
          )}
        </div>
      </div>
    </div>
  )
}

export default SessionUpdateModal
