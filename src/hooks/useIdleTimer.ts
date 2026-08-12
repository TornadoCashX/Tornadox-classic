import { useEffect, useRef } from 'react'

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const

// Mirrors layouts/default.vue's <v-idle :duration="300" @idle="handleOpenModal"> - a generic
// "no mouse/keyboard activity for `timeoutMs`" detector. `enabled` gates the whole thing (the
// idle listeners aren't attached at all unless there's an active Note Account session to protect).
export const useIdleTimer = (onIdle: () => void, timeoutMs: number, enabled: boolean) => {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onIdleRef = useRef(onIdle)
  onIdleRef.current = onIdle

  useEffect(() => {
    if (!enabled) return

    const reset = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => onIdleRef.current(), timeoutMs)
    }

    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, reset))
    reset()

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, reset))
    }
  }, [enabled, timeoutMs])
}
