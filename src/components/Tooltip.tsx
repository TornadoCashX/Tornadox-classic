import { useState, type ReactNode } from 'react'

// Stand-in for Buefy's b-tooltip (hover/focus-toggled `.tooltip-content`, matching the
// class names Buefy's bundled scss already styles - see assets/styles/components/_field.scss).
const Tooltip = ({
  trigger,
  children,
  className = 'is-primary is-right is-small is-multiline'
}: {
  trigger: ReactNode
  children: ReactNode
  className?: string
}) => {
  const [open, setOpen] = useState(false)
  return (
    <span
      className={`b-tooltip ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <div className="tooltip-content" style={{ display: open ? undefined : 'none' }}>
        {children}
      </div>
      <div className="tooltip-trigger">{trigger}</div>
    </span>
  )
}

export default Tooltip
