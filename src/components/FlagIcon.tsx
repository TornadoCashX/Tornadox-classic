// Ports components/icons/FlagIcon.vue; renders one of the flag-icon-css-style icons defined
// in assets/styles/components/_flag.scss (`.flag-icon-{es,fr,gb,ru,tr,uk,cn}`).
const FlagIcon = ({ code, className }: { code: string; className?: string }) => {
  const mapped = code === 'zh' ? 'cn' : code === 'en' ? 'gb' : code
  return <i className={`flag-icon flag-icon-${mapped} ${className || ''}`} />
}

export default FlagIcon
