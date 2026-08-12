import { useTranslation } from 'react-i18next'

import { useNotice } from '@/context/NoticeContext'
import { useAppContext } from '@/context/AppContext'
import { getExplorerUrl } from '@/lib/networkHelpers'

import './Notices.scss'

// Ports components/Notices.vue: a stack of Buefy b-notification cards inside a
// `<div class="notices is-top">` - the exact markup Buefy's own Notification.vue + bundled
// _notices.scss (position:fixed, top-right stacking, already pulled in via `~buefy/src/scss/
// buefy` in styles/components/_base.scss) expect: `.notification.is-top-right` for each card,
// `.media > .media-left` (icon) + `.media-content` (text/link) inside. The icon itself uses the
// same `.trnd.trnd-{type}.trnd-48px` classes styles/components/_icon.scss already defines for
// exactly these notice types (info/success/warning/danger/loading), matching what Buefy's b-icon
// renders here with pack="trnd" (this project's configured defaultIconPack) at its default
// notification icon size.
const Notices = () => {
  const { t } = useTranslation()
  const { notices, closeNotice } = useNotice()
  const { netId } = useAppContext()

  if (notices.length === 0) return null

  return (
    <div className="notices is-top">
      {notices.map((notice) => (
        <article
          key={notice.id}
          className="notification is-top-right"
          role="alert"
        >
          <button
            type="button"
            className="delete"
            aria-label={t('closeNotification')}
            onClick={() => closeNotice(notice.id)}
          />
          <div className="media">
            <div className="media-left">
              {/* Bulma's `.icon` wrapper defaults to 1.5rem (24px) - `.trnd-48px` sizes the inner
                  icon itself to 3rem (48px), but only `.icon.is-large` grows the *wrapper* to
                  match (Bulma's own is-large = 3rem, exactly `trnd-48px`'s intent). Without it
                  here, the wrapper stayed at 24px while its child rendered at 48px, so the
                  spinning conic-gradient ring only had a quarter of its box to sit centered in -
                  the rest overflowed past the wrapper's edge and got clipped by the notification
                  card, which is what "cut the ring into a crescent" in the screenshot. */}
              <span className="icon is-large">
                <i className={`trnd trnd-${notice.type} trnd-48px`} />
              </span>
            </div>
            <div className="media-content">
              <span>{notice.title}</span>
              {notice.txHash && (
                <a
                  href={getExplorerUrl(notice.netId ?? netId).tx + notice.txHash}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('viewOnEtherscan')}
                </a>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

export default Notices
