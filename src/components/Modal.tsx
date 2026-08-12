import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useModalBehavior } from '@/hooks/useModalBehavior'

// The shell every modal ported from classic's $buefy.modal.open({ hasModalCard: true }) shares:
// the backdrop, Buefy's `.animation-content` wrapper, the `.box-modal` card and its title/close
// header. Each modal used to restate all of it (11 near-identical copies) and wire
// useModalBehavior by hand, which had already drifted - NetworkModal, RemoveAccountConfirm and
// WalletConnectReconnectModal bound the backdrop straight to their close handler instead of the
// hook's onBackdropClick, so they would have kept closing on a backdrop click even if they were
// switched to canCancel: false. Routing every modal through here keeps that impossible.
//
// account/SessionUpdateModal.tsx deliberately stays outside this: classic opens it with
// customClass: 'dialog', which renders Buefy's plain modal-card-head/body/foot dialog markup
// rather than this `.box-modal` card.
const Modal = ({
  title,
  onClose,
  children,
  // Mirrors Buefy's `canCancel` (default ['escape', 'x', 'outside']). Pass false for the modals
  // classic opens with canCancel: false - see useModalBehavior.
  canCancel = true,
  // classic's `customClass: 'is-pinned'`.
  isPinned = false,
  // Modals opened from inside a display:none-by-default container (the navbar tooltips) have to
  // escape it, exactly as Buefy's programmatic modals mount at the app root.
  portal = false,
  cardClassName = '',
  centeredTitle = false,
  focusFirstControl = true,
  // Preserves the data-test hooks classic's own components carry on their close buttons.
  closeDataTest,
  // Some modal flows need their own close control because closing can trigger extra cleanup.
  closeButton
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  canCancel?: boolean
  isPinned?: boolean
  portal?: boolean
  cardClassName?: string
  centeredTitle?: boolean
  focusFirstControl?: boolean
  closeDataTest?: string
  closeButton?: ReactNode
}) => {
  const { onBackdropClick } = useModalBehavior(onClose, canCancel)
  const modalRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const modal = modalRef.current
    const focusable = modal?.querySelector<HTMLElement>(
      '[autofocus], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]):not(.delete), a[href], [tabindex]:not([tabindex="-1"])'
    )
    ;(focusFirstControl ? focusable || modal : modal)?.focus()

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !modal) return
      const openModals = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')
      if (openModals.item(openModals.length - 1) !== modal) return
      const elements = Array.from(
        modal.querySelectorAll<HTMLElement>(
          'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )
      )
      if (!elements.length) {
        event.preventDefault()
        return
      }
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', trapFocus)
    return () => {
      document.removeEventListener('keydown', trapFocus)
      previouslyFocused?.focus()
    }
  }, [focusFirstControl])

  const modal = (
    <div
      ref={modalRef}
      className={`modal is-active${isPinned ? ' is-pinned' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <div className="modal-background" aria-hidden="true" onClick={onBackdropClick} />
      <div className="animation-content">
        <div className={`modal-card box box-modal${cardClassName ? ` ${cardClassName}` : ''}`}>
          <header className="box-modal-header is-spaced">
            {centeredTitle ? (
              <p id={titleId} className="box-modal-title has-text-centered">{title}</p>
            ) : (
              <div id={titleId} className="box-modal-title">{title}</div>
            )}
            {closeButton ?? (
              <button type="button" className="delete" data-test={closeDataTest} onClick={onClose} />
            )}
          </header>
          {children}
        </div>
      </div>
    </div>
  )

  return portal ? createPortal(modal, document.body) : modal
}

export default Modal
