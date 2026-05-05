type ParsedQuestionDate = {
  date?: string
  yearMonth?: { year: string; month: string }
}

type HolidayInfo = {
  date: string
  upcoming?: string
}

const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

const MON_PAT = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'

function iso(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function fmtDate(isoStr: string) {
  const [y, m, d] = isoStr.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

export function extractDateRangeFromQuestion(q: string): { from: string; to: string } | null {
  const s = q.toLowerCase()
  const now = new Date()
  const todayIso = iso(now)

  const addDays = (d: Date, n: number) => {
    const r = new Date(d)
    r.setDate(r.getDate() + n)
    return r
  }

  if (/\b(last|past)\s+year\b/.test(s)) {
    const y = now.getFullYear() - 1
    return { from: `${y}-01-01`, to: `${y}-12-31` }
  }
  if (/\bthis year\b/.test(s)) {
    return { from: `${now.getFullYear()}-01-01`, to: todayIso }
  }

  const yearOnly = s.match(/\b(20\d{2})\b/)
  if (
    yearOnly &&
    !s.match(/\d{4}-\d{2}-\d{2}/) &&
    !s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON_PAT}`)) &&
    !s.match(new RegExp(`${MON_PAT}\\s+\\d{1,2}`))
  ) {
    const y = yearOnly[1]
    return { from: `${y}-01-01`, to: `${y}-12-31` }
  }

  const nWeeks = s.match(/\b(?:last|past)\s+(\d+)[\s\-–]+(?:\d+\s+)?weeks?\b/)
  if (nWeeks) {
    const n = parseInt(nWeeks[1], 10)
    return { from: iso(addDays(now, -n * 7)), to: todayIso }
  }
  if (/\b(last|past)\s+week\b/.test(s)) {
    return { from: iso(addDays(now, -7)), to: todayIso }
  }
  if (/\bthis\s+week\b/.test(s)) {
    const mon = new Date(now)
    const day = mon.getDay()
    mon.setDate(mon.getDate() - (day === 0 ? 6 : day - 1))
    return { from: iso(mon), to: todayIso }
  }

  const nMonths = s.match(/\b(?:last|past)\s+(\d+)\s+months?\b/)
  if (nMonths) {
    return { from: iso(addDays(now, -parseInt(nMonths[1], 10) * 30)), to: todayIso }
  }
  if (/\b(last|past)\s+month\b/.test(s)) {
    return { from: iso(addDays(now, -30)), to: todayIso }
  }
  if (/\bthis\s+month\b/.test(s)) {
    return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, to: todayIso }
  }

  const nDays = s.match(/\b(?:last|past)\s+(\d+)\s+days?\b/)
  if (nDays) {
    return { from: iso(addDays(now, -parseInt(nDays[1], 10))), to: todayIso }
  }
  const nBizDays = s.match(/\b(?:last|past)\s+(\d+)\s+business\s+days?\b/)
  if (nBizDays) {
    return { from: iso(addDays(now, -parseInt(nBizDays[1], 10) * 1.5)), to: todayIso }
  }

  return null
}

export function extractDateFromQuestion(q: string): ParsedQuestionDate {
  const s = q.toLowerCase()

  const isoDate = s.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (isoDate) return { date: isoDate[1] }

  const m1 = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON_PAT}\\s+(\\d{4})\\b`))
  if (m1) {
    const month = String(MONTH_MAP[m1[2].slice(0, 3)] ?? MONTH_MAP[m1[2]]).padStart(2, '0')
    return { date: `${m1[3]}-${month}-${m1[1].padStart(2, '0')}` }
  }

  const m2 = s.match(new RegExp(`\\b${MON_PAT}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(\\d{4})\\b`))
  if (m2) {
    const month = String(MONTH_MAP[m2[1].slice(0, 3)] ?? MONTH_MAP[m2[1]]).padStart(2, '0')
    return { date: `${m2[3]}-${month}-${m2[2].padStart(2, '0')}` }
  }

  const m3 = s.match(new RegExp(`\\b${MON_PAT}\\s+(\\d{4})\\b`))
  if (m3) {
    const month = String(MONTH_MAP[m3[1].slice(0, 3)] ?? MONTH_MAP[m3[1]]).padStart(2, '0')
    return { yearMonth: { year: m3[2], month } }
  }

  return {}
}

function easterSunday(y: number): Date {
  const a = y % 19
  const b = Math.floor(y / 100)
  const c = y % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(y, month - 1, day)
}

function nthWeekday(y: number, month: number, weekday: number, n: number): Date {
  if (n > 0) {
    const d = new Date(y, month - 1, 1)
    let count = 0
    while (count < n) {
      if (d.getDay() === weekday) count++
      if (count < n) d.setDate(d.getDate() + 1)
    }
    return d
  }

  const d = new Date(y, month, 0)
  while (d.getDay() !== weekday) d.setDate(d.getDate() - 1)
  return d
}

export function resolveHolidayDate(q: string): HolidayInfo | null {
  const s = q.toLowerCase()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const explicitYear = q.match(/\b(20\d{2})\b/)
  const wantsLast = /\blast\b/.test(s)

  function pickYear(holidayFn: (y: number) => Date): HolidayInfo {
    if (explicitYear) return { date: iso(holidayFn(parseInt(explicitYear[1], 10))) }
    const thisYearDate = holidayFn(today.getFullYear())
    thisYearDate.setHours(0, 0, 0, 0)
    if (thisYearDate > today || wantsLast) {
      const pastDate = thisYearDate <= today ? thisYearDate : holidayFn(today.getFullYear() - 1)
      return {
        date: iso(pastDate),
        upcoming: thisYearDate > today ? iso(thisYearDate) : undefined,
      }
    }
    return { date: iso(thisYearDate) }
  }

  if (/mother'?s?\s*day/.test(s)) return pickYear(y => nthWeekday(y, 5, 0, 2))
  if (/father'?s?\s*day/.test(s)) return pickYear(y => nthWeekday(y, 9, 0, 1))
  if (/australia\s*day/.test(s)) return pickYear(y => new Date(y, 0, 26))
  if (/anzac\s*day/.test(s)) return pickYear(y => new Date(y, 3, 25))
  if (/christmas\s*day|xmas\s*day/.test(s)) return pickYear(y => new Date(y, 11, 25))
  if (/boxing\s*day/.test(s)) return pickYear(y => new Date(y, 11, 26))
  if (/new\s*year'?s?\s*day/.test(s)) return pickYear(y => new Date(y, 0, 1))
  if (/new\s*year'?s?\s*eve/.test(s)) return pickYear(y => new Date(y - 1, 11, 31))
  if (/good\s*friday/.test(s)) return pickYear(y => {
    const e = easterSunday(y)
    e.setDate(e.getDate() - 2)
    return e
  })
  if (/easter\s*monday/.test(s)) return pickYear(y => {
    const e = easterSunday(y)
    e.setDate(e.getDate() + 1)
    return e
  })
  if (/easter/.test(s)) return pickYear(y => easterSunday(y))
  if (/queens?\s*birthday|king'?s?\s*birthday/.test(s)) return pickYear(y => nthWeekday(y, 6, 1, 2))
  if (/labour\s*day|labor\s*day/.test(s)) return pickYear(y => nthWeekday(y, 5, 1, 1))

  return null
}
