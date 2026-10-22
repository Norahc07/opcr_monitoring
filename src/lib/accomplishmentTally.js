import { outputKey, loadTallyContext } from './opcr'
import { saveDailyLogs } from './daily'
import { supabase } from './supabase'
import { ACCOMPLISHMENT_YEAR, setCellEntry } from './accomplishment'

export const ACCOMPLISHMENT_TALLY_LINKS = [
  { column: 'Layout', output: 'Lay out Design' },
  { column: 'Layout Design', output: 'Lay out Design' },
  { column: 'ID', output: 'ID' },
  { column: 'Client Assisting', output: 'Client Assistance' },
  { column: 'Training', output: 'Training Facilitated' },
  { column: 'Training / Google Forms', output: 'Training Facilitated' },
  { column: 'PC Maintenance', output: 'Computer (Desktop/Laptop) Repair & Maintenance' },
  { column: 'PC Maintenance / Repair', output: 'Computer (Desktop/Laptop) Repair & Maintenance' },
  { column: 'Delivery Inspection', output: 'Delivery Inspection' },
]

export const ACCOMPLISHMENT_COUNT_RULES = [
  {
    title: 'Number first',
    text: 'Start the line with the count, then the detail.',
  },
  {
    title: 'One job per line',
    text: 'Use Add for a second job on the same day. Update replaces the whole cell.',
  },
  {
    title: 'Only the first number counts',
    text: 'The words after the number stay on this report.',
  },
  {
    title: 'Linked columns update the tally',
    text: 'A linked column sends that day’s count to the tally. Do not enter it again in the Daily log.',
  },
]

function columnKey(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function tallyOutputForColumn(label) {
  const key = columnKey(label)
  return ACCOMPLISHMENT_TALLY_LINKS.find((link) => columnKey(link.column) === key)?.output || ''
}

export function countLeadingLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .reduce((sum, line) => {
      const match = line.trim().match(/^(\d+(?:\.\d+)?)\b/)
      if (!match) return sum
      const value = Number(match[1])
      return Number.isFinite(value) ? sum + value : sum
    }, 0)
}

export function quantityForOutput(entries, columns, date, output) {
  return (columns || []).reduce((sum, column) => {
    if (tallyOutputForColumn(column.label) !== output) return sum
    return sum + countLeadingLines(entries?.[date]?.[column.id])
  }, 0)
}

function notesForOutput(entries, columns, date, output) {
  return (columns || [])
    .filter((column) => tallyOutputForColumn(column.label) === output)
    .map((column) => String(entries?.[date]?.[column.id] || '').trim())
    .filter(Boolean)
    .join('\n')
}

function findOutputItem(items, output) {
  const wanted = outputKey(output)
  return (items || []).find((item) => item?.id && outputKey(item.output) === wanted) || null
}

export async function syncAccomplishmentOutputs({ userId, columns, entries, dates, outputs }) {
  const linked = [...new Set((outputs || []).filter(Boolean))]
  const workDates = [...new Set((dates || []).filter(Boolean))]
  if (!userId || !linked.length || !workDates.length) return []
  if (!supabase) throw new Error('The tally is not connected.')

  const context = await loadTallyContext(supabase, { userId })
  if (!context.period?.id || !context.staff?.id) {
    throw new Error('This account is not linked to the tally board yet.')
  }

  const saved = []
  for (const output of linked) {
    const item = findOutputItem(context.items, output)
    if (!item) {
      throw new Error(`${output} is not on the tally board, so this column was saved here only.`)
    }
    for (const date of workDates) {
      const quantity = quantityForOutput(entries, columns, date, output)
      const notes = notesForOutput(entries, columns, date, output)
      const { data: existing, error: existingError } = await supabase
        .from('opcr_daily_logs')
        .select('id')
        .eq('staff_id', context.staff.id)
        .eq('item_id', item.id)
        .eq('work_date', date)
        .maybeSingle()
      if (existingError) throw existingError
      if (!existing?.id && quantity <= 0 && !notes) continue
      await saveDailyLogs(supabase, {
        periodId: context.period.id,
        staffId: context.staff.id,
        userId,
        workDate: date,
        rows: [
          {
            item_id: item.id,
            quantity,
            notes,
            log_id: existing?.id,
          },
        ],
      })
      saved.push({ output, date, quantity })
    }
  }
  return saved
}

export const IPCR_COUNT_PERIODS = [
  {
    id: 'jan_jun',
    label: 'January to June',
    path: '/ipcr/january-june',
    startMonth: 1,
    endMonth: 6,
  },
  {
    id: 'jul_dec',
    label: 'July to December',
    path: '/ipcr/july-december',
    startMonth: 7,
    endMonth: 12,
  },
]

export function ipcrPeriodIdFromPath(pathname) {
  const match = IPCR_COUNT_PERIODS.find((period) => pathname === period.path)
  return match?.id || IPCR_COUNT_PERIODS[0].id
}

export function ipcrPeriodForDate(iso, year = ACCOMPLISHMENT_YEAR) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!match || Number(match[1]) !== year) return null
  const month = Number(match[2])
  return IPCR_COUNT_PERIODS.find((period) => month >= period.startMonth && month <= period.endMonth) || null
}

export function canonicalTallyOutput(columns, output) {
  const wanted = outputKey(output)
  if (!wanted) return ''
  for (const column of columns || []) {
    const tally = tallyOutputForColumn(column.label)
    if (tally && outputKey(tally) === wanted) return tally
  }
  return ''
}

export function outputCountLines(entries, columns, output, year = ACCOMPLISHMENT_YEAR) {
  const canonical = canonicalTallyOutput(columns, output)
  const periods = IPCR_COUNT_PERIODS.map((period) => ({ ...period, lines: [], total: 0 }))
  if (!canonical) return { linked: false, output: '', periods, total: 0 }

  const lines = Object.keys(entries || {})
    .filter((date) => ipcrPeriodForDate(date, year))
    .sort()
    .map((date) => ({
      date,
      quantity: quantityForOutput(entries, columns, date, canonical),
    }))
    .filter((line) => line.quantity > 0)

  const grouped = periods.map((period) => {
    const rows = lines.filter((line) => ipcrPeriodForDate(line.date, year)?.id === period.id)
    return {
      ...period,
      lines: rows,
      total: rows.reduce((sum, row) => sum + row.quantity, 0),
    }
  })
  return {
    linked: true,
    output: canonical,
    periods: grouped,
    total: grouped.reduce((sum, period) => sum + period.total, 0),
  }
}

function replaceLeadingCount(text, quantity) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const numbered = lines.filter((line) => /^(\d+(?:\.\d+)?)\b/.test(line))
  if (numbered.length !== 1) return String(quantity)
  let replaced = false
  return lines
    .map((line) => {
      if (replaced || !/^(\d+(?:\.\d+)?)\b/.test(line)) return line
      replaced = true
      return line.replace(/^(\d+(?:\.\d+)?)(.*)$/, `${quantity}$2`)
    })
    .join('\n')
}

export function writeOutputCount(entries, columns, output, date, quantity) {
  const canonical = canonicalTallyOutput(columns, output)
  const linked = (columns || []).filter((column) => tallyOutputForColumn(column.label) === canonical)
  if (!canonical || !linked.length) return entries
  const amount = Number(quantity)
  const safe = Number.isFinite(amount) && amount > 0 ? amount : 0
  const contributors = linked.filter((column) => countLeadingLines(entries?.[date]?.[column.id]) > 0)
  let next = entries || {}
  if (safe <= 0) {
    for (const column of linked) next = setCellEntry(next, date, column.id, '')
    return next
  }
  if (contributors.length <= 1) {
    const target = contributors[0] || linked[0]
    const current = String(entries?.[date]?.[target.id] || '')
    const text = current.trim() ? replaceLeadingCount(current, safe) : String(safe)
    next = setCellEntry(next, date, target.id, text)
    for (const column of linked) {
      if (column.id !== target.id) next = setCellEntry(next, date, column.id, '')
    }
    return next
  }
  next = setCellEntry(next, date, linked[0].id, String(safe))
  for (const column of linked.slice(1)) next = setCellEntry(next, date, column.id, '')
  return next
}

export function formatCountValue(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 100) / 100)
}

export function formatCountDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!match) return iso
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function periodDateBounds(period, year = ACCOMPLISHMENT_YEAR) {
  const last = new Date(year, period.endMonth, 0).getDate()
  const month = (value) => String(value).padStart(2, '0')
  const day = (value) => String(value).padStart(2, '0')
  return {
    start: `${year}-${month(period.startMonth)}-01`,
    end: `${year}-${month(period.endMonth)}-${day(last)}`,
  }
}
