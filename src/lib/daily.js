import { coreFunctionLabel, orderCoreFunctionItems } from './coreFunctions'
import { formatCount, getActivePeriod, getLinkedStaff, toCount } from './opcr'

export function todayValue() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

export function semesterCaption(value) {
  const month = Number(String(value || '').slice(5, 7))
  return month > 0 && month <= 6 ? 'January–June' : 'July–December'
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
  return error
}

export async function loadDailyContext(supabase, userId) {
  const period = await getActivePeriod(supabase)
  const staff = await getLinkedStaff(supabase, userId)
  if (!period) {
    return { period: null, staff, items: [], logs: [] }
  }

  const [{ data: items, error: itemsError }, { data: logs, error: logsError }] = await Promise.all([
    supabase
      .from('opcr_items')
      .select('*')
      .eq('period_id', period.id)
      .order('sort_order', { ascending: true }),
    staff?.id
      ? supabase
          .from('opcr_daily_logs')
          .select('*')
          .eq('period_id', period.id)
          .eq('staff_id', staff.id)
          .order('work_date', { ascending: false })
          .limit(400)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (itemsError) throw itemsError
  if (logsError) throw missingDailyError(logsError)

  return {
    period,
    staff,
    items: orderCoreFunctionItems(items || []),
    logs: logs || [],
  }
}

export function logsForDate(logs, workDate) {
  return (logs || []).filter((row) => row.work_date === workDate)
}

export function semesterTotal(logs, itemId, workDate) {
  const month = Number(String(workDate || '').slice(5, 7))
  const inFirst = month > 0 && month <= 6
  return (logs || []).reduce((sum, row) => {
    if (row.item_id !== itemId) return sum
    const rowMonth = Number(String(row.work_date || '').slice(5, 7))
    const rowFirst = rowMonth > 0 && rowMonth <= 6
    if (rowFirst !== inFirst) return sum
    return sum + toCount(row.quantity)
  }, 0)
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
  const itemName = Object.fromEntries((items || []).map((item) => [item.id, coreFunctionLabel(item.output)]))
  const byDate = new Map()
  for (const row of logs || []) {
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
