import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

// Ports store/loading.js + components/Loaders/Loader.vue: classic drives one global full-page
// overlay (mounted once in layouts/default.vue) from a single Vuex module that any component can
// dispatch to ('loading/enable' | 'loading/changeText' | 'loading/updateProgress' |
// 'loading/disable'). Long-running async flows (note lookup, proof generation, relayer
// submission, wallet tx confirmation) show their progress there - never inline in the
// component that triggered them - so a long message never has to fight that component's own
// layout for space. ApproveLoader.vue's `type: 'approve'` sub-state isn't ported: nothing in
// web-react dispatches it yet.
interface LoadingState {
  enabled: boolean
  message: string
  progress: number
}

interface LoadingContextValue extends LoadingState {
  enable: (message: string) => void
  changeText: (message: string) => void
  updateProgress: (progress: number, message?: string) => void
  disable: () => void
}

const idleLoading: LoadingState = { enabled: false, message: '', progress: -1 }

const LoadingContext = createContext<LoadingContextValue | null>(null)

export const LoadingProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<LoadingState>(idleLoading)

  const enable = useCallback((message: string) => setState({ enabled: true, message, progress: -1 }), [])
  const changeText = useCallback((message: string) => setState((prev) => ({ ...prev, enabled: true, message })), [])
  const updateProgress = useCallback(
    (progress: number, message?: string) =>
      setState((prev) => ({ ...prev, enabled: true, progress, ...(message === undefined ? {} : { message }) })),
    []
  )
  const disable = useCallback(() => setState(idleLoading), [])

  const value = useMemo<LoadingContextValue>(
    () => ({ ...state, enable, changeText, updateProgress, disable }),
    [state, enable, changeText, updateProgress, disable]
  )

  return <LoadingContext.Provider value={value}>{children}</LoadingContext.Provider>
}

export const useLoading = () => {
  const ctx = useContext(LoadingContext)
  if (!ctx) throw new Error('useLoading must be used within a LoadingProvider')
  return ctx
}
