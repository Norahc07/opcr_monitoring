import { holidayNameOn } from './phHolidays'

export const ACCOMPLISHMENT_YEAR = 2026

export const ACCOMPLISHMENT_COLUMNS = [
  { id: 'cashier', label: 'Cashier' },
  { id: 'printing', label: 'Printing' },
  { id: 'layout', label: 'Layout' },
  { id: 'clients', label: 'Clients Assisting' },
  { id: 'training', label: 'Training' },
  { id: 'id', label: 'ID' },
  { id: 'online', label: 'Online Appointment' },
  { id: 'others', label: 'Others' },
]

export const ACCOMPLISHMENT_SIGNERS = {
  prepared: { name: 'LUIGI D. AMARILLO', title: 'KNOWLEDGE WORKER' },
  noted: { name: 'CONCHITA MARTA B. MIRABUENO', title: 'CoE Manager' },
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function pad(value) {
  return String(value).padStart(2, '0')
}

export function isoDate(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`
}

export function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

export function periodId(year, month, half) {
  return `${year}-${pad(month)}-${half}`
}

export function buildPeriods(year = ACCOMPLISHMENT_YEAR) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1
    const last = lastDayOfMonth(year, month)
    const name = MONTHS[index].toUpperCase()
    return [
      {
        id: periodId(year, month, 'a'),
        year,
        month,
        startDay: 1,
        endDay: 15,
        tabLabel: `${name} 1-15 ${year}`,
        rangeLabel: `${MONTHS[index]} 1-15, ${year}`,
      },
      {
        id: periodId(year, month, 'b'),
        year,
        month,
        startDay: 16,
        endDay: last,
        tabLabel: `${name} 16-${last} ${year}`,
        rangeLabel: `${MONTHS[index]} 16-${last}, ${year}`,
      },
    ]
  }).flat()
}

export function defaultPeriodId(year = ACCOMPLISHMENT_YEAR) {
  return periodId(year, 9, 'a')
}

export function formatSheetDate(year, month, day) {
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function isWeekend(year, month, day) {
  const weekday = new Date(year, month - 1, day).getDay()
  return weekday === 0 || weekday === 6
}

export function rowsForPeriod(period) {
  if (!period) return []
  const rows = []
  for (let day = period.startDay; day <= period.endDay; day += 1) {
    const holiday = holidayNameOn(period.year, period.month, day)
    rows.push({
      key: isoDate(period.year, period.month, day),
      year: period.year,
      month: period.month,
      day,
      label: formatSheetDate(period.year, period.month, day),
      holiday,
      off: !holiday && isWeekend(period.year, period.month, day),
    })
  }
  return rows
}

/** Sample entries from the office Excel sheet for September 1–15, 2026. Local preview only. */
export const SAMPLE_ENTRIES = {
  '2026-09-01': {
    printing: '1 CLIENT',
    others: 'Developing the OPCR\nMonitoring System',
  },
  '2026-09-02': {
    clients: '1 PNP',
    others: 'Taking Picture\n(1 utility)',
  },
  '2026-09-03': {
    others: 'Developing the OPCR\nMonitoring System',
  },
  '2026-09-04': {
    cashier: 'CASHIER',
    printing: '1 CLIENT',
  },
  '2026-09-07': {
    printing: '1 CLIENT\n(14 pages)',
    clients: '1 PNP\n1 PDOS',
  },
  '2026-09-08': {
    cashier: 'CASHIER',
    printing: '1 CLIENT\n(12 pages)',
    layout: '2 PK MIDD\n17 LGU Sign',
    clients: '1 PDOS\n1 NBEI',
  },
  '2026-09-09': {
    cashier: 'CASHIER',
    printing: '1 CLIENT\n(15 pages)',
    clients: '1 PNP',
  },
  '2026-09-10': {
    training: 'CANVA FACILITATOR',
  },
}

export function cellText(dateKey, columnId, entries = SAMPLE_ENTRIES) {
  return String(entries?.[dateKey]?.[columnId] || '')
}

const STORE_KEY = 'opcr-accomplishment-v1'

export function defaultAccomplishmentStore() {
  return {
    columns: ACCOMPLISHMENT_COLUMNS.map((column) => ({ ...column })),
    entries: { ...SAMPLE_ENTRIES },
  }
}

export function readAccomplishmentStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return defaultAccomplishmentStore()
    const parsed = JSON.parse(raw)
    const columns = Array.isArray(parsed?.columns)
      ? parsed.columns
          .map((column) => ({
            id: String(column?.id || '').trim(),
            label: String(column?.label || '').trim(),
          }))
          .filter((column) => column.id && column.label)
      : []
    return {
      columns: columns.length ? columns : defaultAccomplishmentStore().columns,
      entries: parsed?.entries && typeof parsed.entries === 'object' ? parsed.entries : {},
    }
  } catch {
    return defaultAccomplishmentStore()
  }
}

export function writeAccomplishmentStore(snapshot) {
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        columns: snapshot.columns,
        entries: snapshot.entries,
      }),
    )
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function newColumnId(label) {
  const slug = String(label || 'column')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'column'
  return `${slug}_${Date.now().toString(36)}`
}

export function nextCellText(current, incoming, mode) {
  const added = String(incoming || '').trim()
  const existing = String(current || '').trim()
  if (mode === 'add') {
    if (!added) return existing
    return existing ? `${existing}\n${added}` : added
  }
  return added
}

export function setCellEntry(entries, dateKey, columnId, value) {
  const next = { ...entries }
  const day = { ...(next[dateKey] || {}) }
  const text = String(value || '').trim()
  if (text) day[columnId] = text
  else delete day[columnId]
  if (Object.keys(day).length) next[dateKey] = day
  else delete next[dateKey]
  return next
}

export function moveColumn(columns, fromId, toId) {
  if (!fromId || !toId || fromId === toId) return columns
  const from = columns.findIndex((column) => column.id === fromId)
  const to = columns.findIndex((column) => column.id === toId)
  if (from < 0 || to < 0) return columns
  const next = [...columns]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export function renameColumn(columns, columnId, label) {
  return columns.map((column) =>
    column.id === columnId ? { ...column, label: String(label || '').trim() } : column,
  )
}

export function removeColumn(columns, entries, columnId) {
  const nextColumns = columns.filter((column) => column.id !== columnId)
  const nextEntries = Object.fromEntries(
    Object.entries(entries).map(([date, day]) => {
      const copy = { ...day }
      delete copy[columnId]
      return [date, copy]
    }),
  )
  return { columns: nextColumns, entries: nextEntries }
}
