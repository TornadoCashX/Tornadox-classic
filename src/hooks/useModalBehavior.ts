import { useEffect } from 'react'

// Reproduces the two behaviours Buefy's <b-modal> gives every modal classic opens through
// $buefy.modal.open() / ModalProgrammatic.open(), neither of which came along when these modals
// were re-implemented as plain conditional overlays:
//
//  1. `canCancel` (buefy/src/components/modal/Modal.vue) defaults to ['escape', 'x', 'outside'],
//     so pressing Escape or clicking the backdrop closes the modal. Classic opts out per modal
//     by passing `canCancel: false` (the deposit note modal, the WalletConnect QR modal and the
//     account setup modal) - pass canCancel: false here for exactly those.
//  2. It toggles `is-clipped` on <html> while open, which is Bulma's `overflow: hidden`, so the
//     page behind the modal stops scrolling.
//
// The clip is reference counted because modals can legitimately overlap (the account page can
// have its session-timeout modal open on top of another one) - a plain add/remove would let the
// first one to unmount release the lock while another is still open.
let clipCount = 0
const modalStack: Array<{ canCancel: boolean; onClose: () => void }> = []

const retainClip = () => {
  clipCount += 1
  document.documentElement.classList.add('is-clipped')
}

const releaseClip = () => {
  clipCount = Math.max(0, clipCount - 1)
  if (clipCount === 0) {
    document.documentElement.classList.remove('is-clipped')
  }
}

export const useModalBehavior = (onClose: () => void, canCancel = true) => {
  useEffect(() => {
    retainClip()
    const entry = { canCancel, onClose }
    modalStack.push(entry)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && modalStack[modalStack.length - 1] === entry && entry.canCancel) entry.onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      const index = modalStack.indexOf(entry)
      if (index >= 0) modalStack.splice(index, 1)
      document.removeEventListener('keydown', onKeyDown)
      releaseClip()
    }
  }, [onClose, canCancel])

  // Spread onto the `.modal-background` element. Undefined (rather than a no-op) when the modal
  // opted out, so the backdrop keeps the default non-interactive cursor.
  return { onBackdropClick: canCancel ? onClose : undefined }
}
