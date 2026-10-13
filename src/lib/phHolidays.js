function pad(value) {
  return String(value).padStart(2, '0')
}

function iso(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`
}

function addDays(year, month, day, delta) {
  const date = new Date(Date.UTC(year, month - 1, day + delta))
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

/** Anonymous Gregorian Computus */
function easterSunday(year) {
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
  return { year, month, day }
}

function lastMondayOfAugust(year) {
  const date = new Date(year, 7, 31)
  const offset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - offset)
  return date.getDate()
}

const CHINESE_NEW_YEAR = {
  2024: [2, 10],
  2025: [1, 29],
  2026: [2, 17],
  2027: [2, 6],
  2028: [1, 26],
  2029: [2, 13],
  2030: [2, 3],
}

const EID_DATES = {
  2025: { fitr: [3, 31], adha: [6, 6] },
  2026: { fitr: [3, 20], adha: [5, 27] },
  2027: { fitr: [3, 10], adha: [5, 17] },
}

function pushHoliday(list, year, month, day, name) {
  if (!year || !month || !day || !name) return
  list.push({ date: iso(year, month, day), name })
}

export function philippineHolidays(year) {
  const easter = easterSunday(year)
  const maundy = addDays(easter.year, easter.month, easter.day, -3)
  const goodFriday = addDays(easter.year, easter.month, easter.day, -2)
  const blackSaturday = addDays(easter.year, easter.month, easter.day, -1)
  const holidays = []

  pushHoliday(holidays, year, 1, 1, "New Year's Day")
  pushHoliday(holidays, maundy.year, maundy.month, maundy.day, 'Maundy Thursday')
  pushHoliday(holidays, goodFriday.year, goodFriday.month, goodFriday.day, 'Good Friday')
  pushHoliday(holidays, blackSaturday.year, blackSaturday.month, blackSaturday.day, 'Black Saturday')
  pushHoliday(holidays, year, 4, 9, 'Araw ng Kagitingan')
  pushHoliday(holidays, year, 5, 1, 'Labor Day')
  pushHoliday(holidays, year, 6, 12, 'Independence Day')
  pushHoliday(holidays, year, 8, 21, 'Ninoy Aquino Day')
  pushHoliday(holidays, year, 8, lastMondayOfAugust(year), 'National Heroes Day')
  pushHoliday(holidays, year, 11, 1, "All Saints' Day")
  pushHoliday(holidays, year, 11, 2, "All Souls' Day")
  pushHoliday(holidays, year, 11, 30, 'Bonifacio Day')
  pushHoliday(holidays, year, 12, 8, 'Feast of the Immaculate Conception')
  pushHoliday(holidays, year, 12, 24, 'Christmas Eve')
  pushHoliday(holidays, year, 12, 25, 'Christmas Day')
  pushHoliday(holidays, year, 12, 30, 'Rizal Day')
  pushHoliday(holidays, year, 12, 31, 'Last Day of the Year')

  const lunar = CHINESE_NEW_YEAR[year]
  if (lunar) pushHoliday(holidays, year, lunar[0], lunar[1], 'Chinese New Year')

  const eid = EID_DATES[year]
  if (eid?.fitr) pushHoliday(holidays, year, eid.fitr[0], eid.fitr[1], "Eid'l Fitr")
  if (eid?.adha) pushHoliday(holidays, year, eid.adha[0], eid.adha[1], "Eid'l Adha")

  return holidays
}

export function holidayNameOn(year, month, day) {
  const key = iso(year, month, day)
  return philippineHolidays(year).find((row) => row.date === key)?.name || ''
}
