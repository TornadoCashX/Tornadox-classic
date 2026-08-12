import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

// Mirrors the vue-clipboard2 `v-clipboard:success="onCopy"` handlers classic hangs off every
// copy button (DepositModalBox.vue, Tx.vue, the account modals): copy, swap the button's label
// to "Copied" for a moment, then put the original label back. Six components each wrote out
// their own copyLabel state + setTimeout for this.
//
// `label` is '' until a copy succeeds, so call sites keep rendering their own default with
// `label || t('copy')` exactly as before.
const RESET_DELAY_MS = 1500

export const useCopyToClipboard = () => {
  const { t } = useTranslation()
  const [label, setLabel] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  // Without this, copying and then unmounting (closing the modal) leaves a pending timer that
  // fires setLabel on a dead component.
  useEffect(() => () => clearTimeout(timerRef.current), [])

  const copy = useCallback(
    async (value: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(value)
        setLabel(t('copied'))
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setLabel(''), RESET_DELAY_MS)
        return true
      } catch (error) {
        setLabel('')
        // Clipboard access can be denied by browser permissions or an insecure origin.
        // eslint-disable-next-line no-console
        console.warn('Clipboard write failed:', error)
        return false
      }
    },
    [t]
  )

  return { copy, label }
}
