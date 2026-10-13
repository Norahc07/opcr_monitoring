import {
  assignedItemIdSet,
  buildBoardRows,
  formatCount,
  itemsVisibleToPerson,
  missingSemesterError,
  loadTallyContext,
  TALLY_PERIOD_ID,
  tallyKey,
  toCount,
} from './opcr'

export function todayValue() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

export const DAILY_SEMESTERS = [
  { id: 'jan_jun', label: 'January – June', shortLabel: 'Jan–Jun' },
  { id: 'jul_dec', label: 'July – December', shortLabel: 'Jul–Dec' },
]

export function workYear(value) {
  return String(value || '').slice(0, 4)
}

export function dailySemesterId(value) {
  const month = Number(String(value || '').slice(5, 7))
  return month >= 7 ? 'jul_dec' : 'jan_jun'
}

export function semesterDateBounds(year, semesterId) {
  const y = String(year || new Date().getFullYear())
  if (semesterId === 'jul_dec') {
    return { min: `${y}-07-01`, max: `${y}-12-31` }
  }
  return { min: `${y}-01-01`, max: `${y}-06-30` }
}

export function clampDateToSemester(value, semesterId) {
  const date = String(value || todayValue())
  const year = workYear(date) || String(new Date().getFullYear())
  const { min, max } = semesterDateBounds(year, semesterId)
  if (date < min) return min
  if (date > max) return max
  return date
}

export function shiftToSemester(value, semesterId) {
  const date = String(value || todayValue())
  if (dailySemesterId(date) === semesterId) return clampDateToSemester(date, semesterId)
  const [year, month, day] = date.split('-').map(Number)
  const nextMonth = semesterId === 'jul_dec' ? month + 6 : month - 6
  const lastDay = new Date(year, nextMonth, 0).getDate()
  const nextDay = Math.min(day || 1, lastDay)
  return `${year}-${String(nextMonth).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`
}

export function yearCaption(value) {
  const year = workYear(value)
  return year ? `January–December ${year}` : 'January–December'
}

export function semesterCaption(value, semesterId) {
  const year = workYear(value)
  const id = semesterId || dailySemesterId(value)
  const label = DAILY_SEMESTERS.find((row) => row.id === id)?.label || 'January – June'
  return year ? `${label} ${year}` : label
}

export function yearTotal(logs, itemId, workDate) {
  const year = workYear(workDate)
  return (logs || []).reduce((sum, row) => {
    if (row.item_id !== itemId) return sum
    if (year && !String(row.work_date || '').startsWith(year)) return sum
    return sum + toCount(row.quantity)
  }, 0)
}

export function semesterTotal(logs, itemId, workDate, semesterId) {
  const year = workYear(workDate)
  const sem = semesterId || dailySemesterId(workDate)
  return (logs || []).reduce((sum, row) => {
    if (row.item_id !== itemId) return sum
    const date = String(row.work_date || '')
    if (year && !date.startsWith(year)) return sum
    if (dailySemesterId(date) !== sem) return sum
    return sum + toCount(row.quantity)
  }, 0)
}

export function formatWorkDate(value) {
  if (!value) return '—'
  const [year, month, day] = String(value).split('-').map(Number)
  if (!year || !month || !day) return String(value)
  return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function missingDailyError(error) {
  const message = error?.message || ''
  if (error?.code === 'PGRST205' || message.includes('opcr_daily_logs')) {
    return new Error(
      'Daily logs are not set up yet. Open Supabase → SQL Editor → run supabase/daily.sql, then refresh this page.',
    )
  }
  return missingSemesterError(error)
}

export async function loadDailyContext(supabase, userId) {
  const context = await loadTallyContext(supabase, { userId })
  const { period, staff, items, tallies, personItemByOutput } = context
  if (!period) {
    return { period: null, staff, items: [], logs: [] }
  }

  const { data: logs, error: logsError } = staff?.id
    ? await supabase
        .from('opcr_daily_logs')
        .select('*')
        .eq('period_id', period.id)
        .eq('staff_id', staff.id)
        .order('work_date', { ascending: false })
        .limit(400)
    : { data: [], error: null }

  if (logsError) throw missingDailyError(logsError)

  const visibleItems = itemsVisibleToPerson(staff, items, tallies, personItemByOutput, logs || [])
  const activeItemIds = assignedItemIdSet(staff, visibleItems, personItemByOutput)
  const boardRows = staff
    ? buildBoardRows([staff], visibleItems, tallies, personItemByOutput)
    : {}
  const withBoard = visibleItems.map((item) => {
    const key = staff?.id ? tallyKey(staff.id, item.id, TALLY_PERIOD_ID) : item.id
    return {
      ...item,
      board_actual: toCount(boardRows[key]?.accomplished),
    }
  })

  return {
    period,
    staff,
    items: withBoard,
    logs: (logs || []).filter((row) => activeItemIds.has(row.item_id)),
  }
}

export function logsForDate(logs, workDate) {
  return (logs || []).filter((row) => row.work_date === workDate)
}

export async function saveDailyLogs(supabase, { periodId, staffId, userId, workDate, rows }) {
  const payload = rows
    .map((row) => ({
      period_id: periodId,
      staff_id: staffId,
      user_id: userId,
      item_id: row.item_id,
      work_date: workDate,
      quantity: toCount(row.quantity),
      notes: String(row.notes || '').trim(),
    }))
    .filter((row) => row.item_id && (row.quantity > 0 || row.notes))

  const toDelete = rows.filter((row) => row.log_id && toCount(row.quantity) <= 0 && !String(row.notes || '').trim())
  if (toDelete.length) {
    const { error: deleteError } = await supabase
      .from('opcr_daily_logs')
      .delete()
      .in(
        'id',
        toDelete.map((row) => row.log_id),
      )
    if (deleteError) throw missingDailyError(deleteError)
  }

  if (!payload.length) return []

  const { data, error } = await supabase
    .from('opcr_daily_logs')
    .upsert(payload, { onConflict: 'staff_id,item_id,work_date' })
    .select('*')
  if (error) throw missingDailyError(error)
  return data || []
}

export function groupDailyHistory(logs, items) {
  const activeIds = new Set((items || []).map((item) => item.id).filter(Boolean))
  const itemName = Object.fromEntries((items || []).map((item) => [item.id, item.output || 'Item']))
  const byDate = new Map()
  for (const row of logs || []) {
    if (!activeIds.has(row.item_id)) continue
    const date = row.work_date
    if (!byDate.has(date)) byDate.set(date, [])
    byDate.get(date).push({
      ...row,
      label: itemName[row.item_id] || 'Item',
      display: formatCount(row.quantity),
    })
  }
  return [...byDate.entries()].map(([date, rows]) => ({
    date,
    rows: rows.filter((row) => toCount(row.quantity) > 0 || row.notes),
    total: rows.reduce((sum, row) => sum + toCount(row.quantity), 0),
  }))
}

const DAILY_CACHE_KEY = 'opcr-daily-log'
const DAILY_CACHE_VERSION = 'opcr-src-v6'

export function readDailyCache(userId) {
  if (!userId) return null
  try {
    const raw = sessionStorage.getItem(DAILY_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.userId !== userId) return null
    if (parsed.cacheVersion !== DAILY_CACHE_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

export function writeDailyCache(snapshot) {
  if (!snapshot?.userId) return
  try {
    sessionStorage.setItem(
      DAILY_CACHE_KEY,
      JSON.stringify({ ...snapshot, cacheVersion: DAILY_CACHE_VERSION }),
    )
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function clearDailyCache() {
  try {
    sessionStorage.removeItem(DAILY_CACHE_KEY)
  } catch {
    // Ignore private-mode failures.
  }
}
