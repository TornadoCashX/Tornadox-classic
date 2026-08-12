import { createPortal } from 'react-dom'

import { useLoading } from '@/context/LoadingContext'

// Ports components/Loaders/Loader.vue - the single `b-loading` mounted once at the app root
// (layouts/default.vue) that every long-running async flow reports its progress to, instead of
// showing that progress inline in whichever component triggered it. Portaled to document.body so
// its `is-full-page` fixed positioning covers the whole viewport regardless of where the
// triggering component sits in the tree.
const GlobalLoadingOverlay = () => {
  const { enabled, message, progress } = useLoading()

  if (!enabled) return null

  return createPortal(
    <div className="loading-overlay is-active is-full-page">
      <div className="loading-background" />
      <div className="loading-container">
        <div className="loading-tornado" data-test="tornado_loader" />
        <div className="loading-message">{message}...</div>
        {progress >= 0 && <div className="loading-message">{progress}%</div>}
      </div>
    </div>,
    document.body
  )
}

export default GlobalLoadingOverlay
