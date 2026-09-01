import { formatCount, getActivePeriod, getLinkedStaff, hydrateOpcrEntry, itemsFromOpcrEntries, loadCanonicalOpcrEntries, missingSemesterError, toCount } from './opcr'

export function todayValue() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

export function yearCaption(value) {
  const year = String(value || '').slice(0, 4)
  return year ? `January–December ${year}` : 'January–December'
}

/** @deprecated use yearCaption */
export function semesterCaption(value) {
  return yearCaption(value)
}

export function yearTotal(logs, itemId, workDate) {
  const year = String(workDate || '').slice(0, 4)
  return (logs || []).reduce((sum, row) => {
    if (row.item_id !== itemId) return sum
    if (year && !String(row.work_date || '').startsWith(year)) return sum
    return sum + toCount(row.quantity)
  }, 0)
}

/** @deprecated use yearTotal */
export function semesterTotal(logs, itemId, workDate) {
  return yearTotal(logs, itemId, workDate)
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
  const period = await getActivePeriod(supabase)
  const staff = await getLinkedStaff(supabase, userId)
  if (!period) {
    return { period: null, staff, items: [], logs: [] }
  }

  const [{ data: logs, error: logsError }, { data: form, error: formError }] = await Promise.all([
      staff?.id
        ? supabase
            .from('opcr_daily_logs')
            .select('*')
            .eq('period_id', period.id)
            .eq('staff_id', staff.id)
            .order('work_date', { ascending: false })
            .limit(400)
        : Promise.resolve({ data: [], error: null }),
      userId
        ? supabase
            .from('opcr_forms')
            .select('id')
            .eq('user_id', userId)
            .eq('period_id', period.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])

  if (logsError) throw missingDailyError(logsError)
  if (formError) throw formError

  let entries = []
  if (form?.id) {
    const { data: entryRows, error: entriesError } = await supabase
      .from('opcr_entries')
      .select('*, opcr_items(*)')
      .eq('form_id', form.id)
    if (entriesError) throw entriesError
    entries = (entryRows || []).map(hydrateOpcrEntry).sort(
      (a, b) => (a.section - b.section) || (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0),
    )
  }

  const canonical = await loadCanonicalOpcrEntries(supabase, period.id)
  const sourceEntries = canonical.length ? canonical : entries
  const items = itemsFromOpcrEntries(sourceEntries, period.id)
  const activeItemIds = new Set(items.map((item) => item.id).filter(Boolean))
  const filteredLogs = (logs || []).filter((row) => activeItemIds.has(row.item_id))

  return {
    period,
    staff,
    items,
    logs: filteredLogs,
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
const DAILY_CACHE_VERSION = 'opcr-src-v3'

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
