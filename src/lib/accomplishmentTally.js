import { outputKey, loadTallyContext } from './opcr'
import { saveDailyLogs } from './daily'
import { supabase } from './supabase'

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
  'Start each line with the count, then the detail. Example: 10 PKM ID',
  'Put one job on each line. A second job on the same day is added with Add, not Update.',
  'Only the first number on a line is counted. The words after it stay on this report.',
  'The column name decides the tally output. ID written inside a Layout line does not also count as ID.',
  'Others, Cashier, Printing, and any column not in the list below stay on this report and do not change the tally.',
  'For a linked column, the lines on that date are that day’s tally count. Do not enter the same number again in the Daily log.',
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
