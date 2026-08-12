const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MONTH = 30 * DAY
const YEAR = 365 * DAY

const relativeUnit = (milliseconds: number): [number, Intl.RelativeTimeFormatUnit] => {
  const absolute = Math.abs(milliseconds)
  if (absolute < 45 * SECOND) return [Math.round(milliseconds / SECOND), 'second']
  if (absolute < 45 * MINUTE) return [Math.round(milliseconds / MINUTE), 'minute']
  if (absolute < 22 * HOUR) return [Math.round(milliseconds / HOUR), 'hour']
  if (absolute < 26 * DAY) return [Math.round(milliseconds / DAY), 'day']
  if (absolute < 11 * MONTH) return [Math.round(milliseconds / MONTH), 'month']
  return [Math.round(milliseconds / YEAR), 'year']
}

export const formatRelativeTime = (timestamp: number, locale?: string, withSuffix = true): string => {
  const [value, unit] = relativeUnit(timestamp * SECOND - Date.now())
  if (!withSuffix) {
    return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'long' }).format(Math.abs(value))
  }
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit)
}

export const formatUtcDate = (timestamp: number, locale?: string): string => {
  return `${new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC'
  }).format(timestamp * SECOND)} UTC`
}
