import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

// Ports store/notice.js + components/Notices.vue: classic's global top-right toast stack, used
// for anything a user should notice even if they've moved on from the component that triggered
// it (a relayer job confirming in the background, a note removed from another tab's still-open
// modal). Mounted once at the app root, same as LoadingContext/GlobalLoadingOverlay.
const DEFAULT_INTERVAL_MS = 10000

export interface NoticeInput {
  type: 'info' | 'warning' | 'danger' | 'success' | 'loading'
  // Either a plain i18n key (t(titleKey)) or, for classic's `{path, amount, currency}` titles
  // (e.g. 'withdrawing'/'withdrawnValue'), pass titleKey plus titleParams for the caller to
  // interpolate with utils/i18nFormat's interpolate() before it ever reaches this context -
  // notices only ever store the already-resolved display string.
  title: string
  txHash?: string
  netId?: number
}

export interface NoticeItem extends NoticeInput {
  id: string
}

interface NoticeContextValue {
  notices: NoticeItem[]
  addNotice: (notice: NoticeInput) => string
  addNoticeWithInterval: (notice: NoticeInput, interval?: number) => string
  updateNotice: (id: string, notice: Partial<NoticeInput>, interval?: number) => void
  closeNotice: (id: string) => void
}

const NoticeContext = createContext<NoticeContextValue | null>(null)

export const NoticeProvider = ({ children }: { children: ReactNode }) => {
  const [notices, setNotices] = useState<NoticeItem[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const clearTimer = useCallback((id: string) => {
    const timerId = timersRef.current.get(id)
    if (timerId) clearTimeout(timerId)
    timersRef.current.delete(id)
  }, [])

  const deleteNotice = useCallback(
    (id: string) => {
      clearTimer(id)
      setNotices((prev) => prev.filter((n) => n.id !== id))
    },
    [clearTimer]
  )

  const scheduleTimer = useCallback(
    (id: string, interval: number) => {
      clearTimer(id)
      timersRef.current.set(
        id,
        setTimeout(() => deleteNotice(id), interval)
      )
    },
    [clearTimer, deleteNotice]
  )

  const addNotice = useCallback((notice: NoticeInput) => {
    const id = `f${Date.now().toString(16)}${Math.random().toString(16).slice(2, 6)}`
    setNotices((prev) => [...prev, { ...notice, id }])
    return id
  }, [])

  const addNoticeWithInterval = useCallback(
    (notice: NoticeInput, interval = DEFAULT_INTERVAL_MS) => {
      const id = addNotice(notice)
      scheduleTimer(id, interval)
      return id
    },
    [addNotice, scheduleTimer]
  )

  // Mirrors updateNotice: patches an existing notice by id (falling back to inserting it fresh
  // if it's gone, e.g. its own timer already deleted it), and only (re)schedules an auto-dismiss
  // timer when the caller passes one - the relayer job-watcher's first "withdrawing" notice is
  // meant to sit untimed until the job resolves and updates it to a timed success/failure state.
  const updateNotice = useCallback(
    (id: string, notice: Partial<NoticeInput>, interval?: number) => {
      setNotices((prev) => {
        const index = prev.findIndex((n) => n.id === id)
        if (index === -1) {
          return [...prev, { type: 'info', title: '', ...notice, id } as NoticeItem]
        }
        const next = prev.slice()
        next[index] = { ...next[index], ...notice }
        return next
      })
      if (interval) scheduleTimer(id, interval)
    },
    [scheduleTimer]
  )

  const closeNotice = deleteNotice

  return (
    <NoticeContext.Provider value={{ notices, addNotice, addNoticeWithInterval, updateNotice, closeNotice }}>
      {children}
    </NoticeContext.Provider>
  )
}

export const useNotice = () => {
  const ctx = useContext(NoticeContext)
  if (!ctx) throw new Error('useNotice must be used within a NoticeProvider')
  return ctx
}
