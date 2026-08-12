// Mirrors nuxt-buefy's "trnd" icon pack (see assets/styles/components/_icon.scss's
// `.trnd.trnd-{name}` mask-image rules) and Bulma's `.icon` wrapper span. Buefy's real b-icon
// applies the size class to BOTH the outer .icon wrapper AND resolves an inner icon-pack size
// class via nuxt.config.js's customIconPacks.trnd.sizes map - is-small maps to no extra class,
// is-medium/is-large map to trnd-36px/trnd-48px on the <i> itself. Only sizing the wrapper (this
// component's previous shape) left the inner glyph stuck at its ~20px base size regardless of
// the requested size, and for is-large specifically also let it overflow/clip out of the smaller
// wrapper (see Notices.tsx's earlier, narrower fix for the same root cause).
const TRND_INNER_SIZE_CLASS: Record<string, string | null> = {
  'is-small': null,
  'is-medium': 'trnd-36px',
  'is-large': 'trnd-48px'
}

const TrndIcon = ({
  name,
  size = 'is-small',
  className
}: {
  name: string
  size?: 'is-small' | 'is-medium' | 'is-large'
  className?: string
}) => {
  const innerSizeClass = TRND_INNER_SIZE_CLASS[size]
  return (
    <span className={`icon ${size} ${className || ''}`}>
      <i className={`trnd trnd-${name}${innerSizeClass ? ` ${innerSizeClass}` : ''}`} />
    </span>
  )
}

// The other, simpler background-image icon system (`.icon.icon-{name}`) used for inline
// buttons like copy/save/info/close.
const BgIcon = ({ name }: { name: string }) => <span className={`icon icon-${name}`} />

export { BgIcon, TrndIcon }
export default TrndIcon
