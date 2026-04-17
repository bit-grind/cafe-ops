// Shared formatters used across the ops UI.

export function money(n: unknown, currency = 'AUD', maxFractionDigits = 0) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(Number(n) || 0)
}

export function fmtNum(n: unknown) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

/** ISO yyyy-mm-dd → dd/mm/yy. Returns em-dash for nullish. */
export function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  if (!y || !m || !d) return s
  return `${d}/${m}/${y.slice(2)}`
}

export function iso(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
