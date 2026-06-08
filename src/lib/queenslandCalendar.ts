import type { DeputyCalendarEvent } from '@/lib/deputyCalendar'

type PublicHoliday = {
  name: string
  date: string
  startTime?: string
  endTime?: string
  status?: string
}

type SchoolHolidayRange = {
  label: string
  dateStart: string
  dateEnd: string
}

const SCHOOL_HOLIDAYS: SchoolHolidayRange[] = [
  { label: 'Term 1 school holidays', dateStart: '2026-04-03', dateEnd: '2026-04-19' },
  { label: 'Term 2 school holidays', dateStart: '2026-06-27', dateEnd: '2026-07-12' },
  { label: 'Term 3 school holidays', dateStart: '2026-09-19', dateEnd: '2026-10-05' },
  { label: 'Summer school holidays', dateStart: '2026-12-12', dateEnd: '2027-01-26' },
  { label: 'Term 1 school holidays', dateStart: '2027-03-26', dateEnd: '2027-04-11' },
  { label: 'Term 2 school holidays', dateStart: '2027-06-26', dateEnd: '2027-07-11' },
  { label: 'Term 3 school holidays', dateStart: '2027-09-18', dateEnd: '2027-10-04' },
  { label: 'Summer school holidays', dateStart: '2027-12-11', dateEnd: '2028-01-23' },
  { label: 'Term 1 school holidays', dateStart: '2028-04-01', dateEnd: '2028-04-17' },
  { label: 'Term 2 school holidays', dateStart: '2028-06-24', dateEnd: '2028-07-09' },
  { label: 'Term 3 school holidays', dateStart: '2028-09-16', dateEnd: '2028-10-02' },
  { label: 'Summer school holidays', dateStart: '2028-12-09', dateEnd: '2029-01-21' },
  { label: 'Term 1 school holidays', dateStart: '2029-03-30', dateEnd: '2029-04-15' },
  { label: 'Term 2 school holidays', dateStart: '2029-06-23', dateEnd: '2029-07-08' },
  { label: 'Term 3 school holidays', dateStart: '2029-09-15', dateEnd: '2029-10-01' },
  // The 2029 summer holiday end date is still pending ministerial approval.
]

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day))
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return utcDate(year, month, day)
}

function isoDate(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

function addDays(value: string, days: number) {
  const date = parseIsoDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return isoDate(date)
}

function firstWeekday(year: number, month: number, weekday: number) {
  const date = utcDate(year, month, 1)
  while (date.getUTCDay() !== weekday) date.setUTCDate(date.getUTCDate() + 1)
  return date
}

function easterSunday(year: number) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
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
  return utcDate(year, month, day)
}

function nextWeekdayOnOrAfter(value: string) {
  let date = value
  while (parseIsoDate(date).getUTCDay() === 0 || parseIsoDate(date).getUTCDay() === 6) {
    date = addDays(date, 1)
  }
  return date
}

function addWeekendExtraHoliday(holidays: PublicHoliday[], name: string, date: string) {
  const day = parseIsoDate(date).getUTCDay()
  if (day !== 0 && day !== 6) return

  const used = new Set(holidays.map(holiday => holiday.date))
  let observedDate = nextWeekdayOnOrAfter(addDays(date, 1))
  while (used.has(observedDate)) observedDate = nextWeekdayOnOrAfter(addDays(observedDate, 1))
  holidays.push({ name: `${name} public holiday`, date: observedDate })
}

function royalQueenslandShowDay(year: number) {
  const firstFriday = firstWeekday(year, 8, 5)
  const start = firstFriday.getUTCDate() < 5 ? addDays(isoDate(firstFriday), 7) : isoDate(firstFriday)
  return addDays(start, 5)
}

function publicHolidaysForYear(year: number) {
  const easter = isoDate(easterSunday(year))
  const australiaDay = `${year}-01-26`
  const australiaDayWeekday = parseIsoDate(australiaDay).getUTCDay()
  const anzacDay = `${year}-04-25`
  const anzacDayWeekday = parseIsoDate(anzacDay).getUTCDay()
  const holidays: PublicHoliday[] = [
    { name: "New Year's Day", date: `${year}-01-01` },
    {
      name: 'Australia Day',
      date: australiaDayWeekday === 0 || australiaDayWeekday === 6
        ? nextWeekdayOnOrAfter(`${year}-01-27`)
        : australiaDay,
    },
    { name: 'Good Friday', date: addDays(easter, -2) },
    { name: 'Easter Saturday', date: addDays(easter, -1) },
    { name: 'Easter Sunday', date: easter },
    { name: 'Easter Monday', date: addDays(easter, 1) },
    { name: 'Anzac Day', date: anzacDayWeekday === 0 ? `${year}-04-26` : anzacDay },
    { name: 'Labour Day', date: isoDate(firstWeekday(year, 5, 1)) },
    { name: 'Royal Queensland Show', date: royalQueenslandShowDay(year), status: 'Brisbane area only' },
    { name: "King's Birthday", date: isoDate(firstWeekday(year, 10, 1)) },
    { name: 'Christmas Eve', date: `${year}-12-24`, startTime: '18:00:00', endTime: '23:59:00', status: '6pm to midnight' },
    { name: 'Christmas Day', date: `${year}-12-25` },
    { name: 'Boxing Day', date: `${year}-12-26` },
  ]

  addWeekendExtraHoliday(holidays, "New Year's Day", `${year}-01-01`)
  addWeekendExtraHoliday(holidays, 'Christmas Day', `${year}-12-25`)
  addWeekendExtraHoliday(holidays, 'Boxing Day', `${year}-12-26`)

  return holidays.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function overlaps(dateStart: string, dateEnd: string, from: string, to: string) {
  return dateEnd >= from && dateStart <= to
}

function publicHolidayEvent(holiday: PublicHoliday): DeputyCalendarEvent {
  const startTime = holiday.startTime ?? '00:00:00'
  const endTime = holiday.endTime ?? '23:59:00'
  return {
    id: `qld-public-holiday-${holiday.date}-${slug(holiday.name)}`,
    source: 'queensland',
    externalId: `public-holiday-${holiday.date}-${slug(holiday.name)}`,
    employeeId: null,
    employeeName: holiday.name,
    type: 'public_holiday',
    status: holiday.status ?? null,
    areaId: null,
    areaName: null,
    areaColor: null,
    start: `${holiday.date}T${startTime}+10:00`,
    end: `${holiday.date}T${endTime}+10:00`,
    dateStart: holiday.date,
    dateEnd: holiday.date,
    comment: holiday.status ?? null,
  }
}

function schoolHolidayEvent(range: SchoolHolidayRange): DeputyCalendarEvent {
  return {
    id: `qld-school-holiday-${range.dateStart}-${range.dateEnd}`,
    source: 'queensland',
    externalId: `school-holiday-${range.dateStart}-${range.dateEnd}`,
    employeeId: null,
    employeeName: 'School holidays',
    type: 'school_holiday',
    status: range.label,
    areaId: null,
    areaName: null,
    areaColor: null,
    start: `${range.dateStart}T00:00:00+10:00`,
    end: `${range.dateEnd}T23:59:00+10:00`,
    dateStart: range.dateStart,
    dateEnd: range.dateEnd,
    comment: range.label,
  }
}

export function normalizeQueenslandCalendarHolidays(from: string, to: string): DeputyCalendarEvent[] {
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return []

  const fromYear = Number(from.slice(0, 4))
  const toYear = Number(to.slice(0, 4))
  const publicHolidays: DeputyCalendarEvent[] = []
  for (let year = fromYear; year <= toYear; year += 1) {
    publicHolidays.push(
      ...publicHolidaysForYear(year)
        .filter(holiday => holiday.date >= from && holiday.date <= to)
        .map(publicHolidayEvent)
    )
  }

  const schoolHolidays = SCHOOL_HOLIDAYS
    .filter(range => overlaps(range.dateStart, range.dateEnd, from, to))
    .map(schoolHolidayEvent)

  return [...publicHolidays, ...schoolHolidays]
    .sort((a, b) => a.start.localeCompare(b.start) || a.employeeName.localeCompare(b.employeeName))
}
