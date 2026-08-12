import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'

// Stand-in for Buefy's b-dropdown as used by the token selector (see
// assets/styles/components/_dropdown.scss's `.dropdown.is-mobile-modal` rules).
interface DropdownProps<T extends string> {
  value: T
  onChange: (value: T) => void
  // `id` is only for React's key prop - defaults to `value`. Pass it explicitly when `value`
  // isn't guaranteed unique across options (e.g. networkConfig.js's rpcUrls legitimately has two
  // different RPC entries both display-named "Mevblocker" - classic's own dropdown keys/selects
  // by that display name too and inherits the same selection ambiguity, but React additionally
  // requires unique keys to render the list correctly at all).
  options: Array<{ value: T; label: string; dataTest?: string; id?: string }>
}

const Dropdown = <T extends string>({ value, onChange, options }: DropdownProps<T>) => {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    if (!isOpen) return
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [isOpen])

  const selected = options.find((option) => option.value === value)
  const focusOption = (index: number) => optionRefs.current[index]?.focus()
  const openAt = (index: number) => {
    setIsOpen(true)
    requestAnimationFrame(() => focusOption(index))
  }
  const onOptionKeyDown = (event: ReactKeyboardEvent, index: number) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusOption((index + 1) % options.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusOption((index - 1 + options.length) % options.length)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      focusOption(event.key === 'Home' ? 0 : options.length - 1)
    } else if (event.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div ref={rootRef} className={`dropdown is-mobile-modal is-expanded ${isOpen ? 'is-active' : ''}`}>
      <button
        type="button"
        className="dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            openAt(event.key === 'ArrowDown' ? 0 : options.length - 1)
          }
        }}
      >
        <div className="control">
          <div className="input">
            <span>{selected?.label}</span>
          </div>
        </div>
      </button>
      {isOpen && (
        <div className="dropdown-menu">
          <div role="listbox" className="dropdown-content">
            {options.map((option) => (
              <button
                type="button"
                key={option.id ?? option.value}
                ref={(node) => { optionRefs.current[options.indexOf(option)] = node }}
                role="option"
                aria-selected={option.value === value}
                className={`dropdown-item ${option.value === value ? 'is-active' : ''}`}
                data-test={option.dataTest}
                onKeyDown={(event) => onOptionKeyDown(event, options.indexOf(option))}
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Dropdown
