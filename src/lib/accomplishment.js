import { holidayNameOn } from './phHolidays'

export const ACCOMPLISHMENT_YEAR = 2026

const KNOWLEDGE_WORKER_COLUMNS = [
  { id: 'cashier', label: 'Cashier' },
  { id: 'printing', label: 'Printing' },
  { id: 'layout', label: 'Layout' },
  { id: 'clients', label: 'Client Assisting' },
  { id: 'training', label: 'Training' },
  { id: 'id', label: 'ID' },
  { id: 'online', label: 'Online Appointment' },
  { id: 'others', label: 'Others' },
]

const MAINTENANCE_COLUMNS = [
  { id: 'cashier', label: 'Cashier' },
  { id: 'printing', label: 'Printing' },
  { id: 'layout', label: 'Layout' },
  { id: 'tech4ed', label: 'Tech4ED' },
  { id: 'clients', label: 'Client Assisting' },
  { id: 'training', label: 'Training' },
  { id: 'id', label: 'ID' },
  { id: 'pc_maintenance', label: 'PC Maintenance' },
  { id: 'others', label: 'Others' },
]

const AIDE_JM_COLUMNS = [
  { id: 'cashier', label: 'Cashier' },
  { id: 'printing', label: 'Printing' },
  { id: 'clients', label: 'Client Assisting' },
  { id: 'layout_design', label: 'Layout Design' },
  { id: 'id_photo_signature', label: 'ID photo & signature Layout' },
  { id: 'training_forms', label: 'Training / Google Forms' },
  { id: 'pc_repair', label: 'PC Maintenance / Repair' },
  { id: 'prepared_docs', label: "Prepared - Project Design & PR's/ Vouchers, & etc." },
  { id: 'processed', label: 'Processed Documents' },
  { id: 'delivery', label: 'Delivery Inspection' },
  { id: 'others', label: 'Others' },
]

const LEGACY_KNOWLEDGE_COLUMNS = KNOWLEDGE_WORKER_COLUMNS.map((column) =>
  column.id === 'clients' ? { ...column, label: 'Clients Assisting' } : { ...column },
)

export const ACCOMPLISHMENT_COLUMNS = KNOWLEDGE_WORKER_COLUMNS

function cloneColumns(columns) {
  return columns.map((column) => ({ ...column }))
}

function sameColumns(left, right) {
  return (
    left.length === right.length &&
    left.every((column, index) => column.id === right[index].id && column.label === right[index].label)
  )
}

function isJmAccount(profile) {
  const shortName = String(profile?.short_name || '').trim().toLowerCase()
  const fullName = String(profile?.full_name || '').trim().toLowerCase()
  const tokens = `${fullName} ${shortName}`.split(/[^a-z0-9]+/).filter(Boolean)
  return shortName.replace(/[^a-z0-9]/g, '') === 'jm' || tokens.includes('jm') || fullName === 'jm'
}

export function accomplishmentColumnsFor(profile) {
  if (isJmAccount(profile)) return cloneColumns(AIDE_JM_COLUMNS)
  const position = String(profile?.position || '').toLowerCase()
  const name = `${profile?.full_name || ''} ${profile?.short_name || ''}`.toLowerCase()
  const maintenance =
    position.includes('computer maintenance') ||
    name.includes('jonathan') ||
    name.includes('jayvee') ||
    name.includes('jay vee')
  return cloneColumns(maintenance ? MAINTENANCE_COLUMNS : KNOWLEDGE_WORKER_COLUMNS)
}

function columnsForAccount(columns, profile) {
  const preset = accomplishmentColumnsFor(profile)
  if (!columns.length) return preset
  const untouched = [
    KNOWLEDGE_WORKER_COLUMNS,
    LEGACY_KNOWLEDGE_COLUMNS,
    MAINTENANCE_COLUMNS,
    AIDE_JM_COLUMNS,
  ].some((row) => sameColumns(columns, row))
  return untouched ? preset : columns
}

export const ACCOMPLISHMENT_NOTED = {
  name: 'CONCHITA MARTA B. MIRABUENO',
  title: 'CoE Manager',
}

export const WEEKDAYS = [
  { id: 0, label: 'Sun' },
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
]

export const DEFAULT_OFF_DAYS = [0, 6]

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
  const now = new Date()
  const month = now.getFullYear() === year ? now.getMonth() + 1 : 1
  const day = now.getFullYear() === year ? now.getDate() : 1
  return periodId(year, month, day <= 15 ? 'a' : 'b')
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

export function normalizeOffDays(days) {
  const source = Array.isArray(days) ? days : DEFAULT_OFF_DAYS
  return [...new Set(source.map((day) => Number(day)))]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b)
}

export function rowsForPeriod(period, offDays = DEFAULT_OFF_DAYS) {
  if (!period) return []
  const off = new Set(normalizeOffDays(offDays))
  const rows = []
  for (let day = period.startDay; day <= period.endDay; day += 1) {
    const holiday = holidayNameOn(period.year, period.month, day)
    const weekday = new Date(period.year, period.month - 1, day).getDay()
    rows.push({
      key: isoDate(period.year, period.month, day),
      year: period.year,
      month: period.month,
      day,
      label: formatSheetDate(period.year, period.month, day),
      holiday,
      off: !holiday && off.has(weekday),
    })
  }
  return rows
}

export function cellText(dateKey, columnId, entries = {}) {
  return String(entries?.[dateKey]?.[columnId] || '')
}

function storeKey(userId) {
  return `opcr-accomplishment-v3:${userId}`
}

export function defaultAccomplishmentStore(profile) {
  return {
    columns: accomplishmentColumnsFor(profile),
    entries: {},
    staffName: '',
    offDays: [...DEFAULT_OFF_DAYS],
  }
}

export function readAccomplishmentStore(userId, profile) {
  if (!userId) return defaultAccomplishmentStore(profile)
  try {
    const raw = localStorage.getItem(storeKey(userId))
    if (!raw) return defaultAccomplishmentStore(profile)
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
      columns: columnsForAccount(columns, profile),
      entries: parsed?.entries && typeof parsed.entries === 'object' ? parsed.entries : {},
      staffName: String(parsed?.staffName || '').trim(),
      offDays: normalizeOffDays(parsed?.offDays),
    }
  } catch {
    return defaultAccomplishmentStore(profile)
  }
}

export function writeAccomplishmentStore(userId, snapshot) {
  try {
    localStorage.setItem(
      storeKey(userId),
      JSON.stringify({
        columns: snapshot.columns,
        entries: snapshot.entries,
        staffName: snapshot.staffName || '',
        offDays: normalizeOffDays(snapshot.offDays),
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
