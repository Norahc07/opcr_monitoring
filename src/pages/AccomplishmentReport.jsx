import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Pencil, Plus, Printer } from 'lucide-react'
import { Button } from '../components/ui'
import { CountActions } from '../components/CountEditModal'
import { CellEditModal, ColumnEditModal } from '../components/AccomplishmentModals'
import { useAuth } from '../context/useAuth'
import {
  ACCOMPLISHMENT_NOTED,
  ACCOMPLISHMENT_YEAR,
  WEEKDAYS,
  buildPeriods,
  cellText,
  defaultPeriodId,
  moveColumn,
  newColumnId,
  nextCellText,
  readAccomplishmentStore,
  removeColumn,
  renameColumn,
  rowsForPeriod,
  setCellEntry,
  writeAccomplishmentStore,
} from '../lib/accomplishment'
import {
  ACCOMPLISHMENT_COUNT_RULES,
  ACCOMPLISHMENT_TALLY_LINKS,
  syncAccomplishmentOutputs,
  tallyOutputForColumn,
} from '../lib/accomplishmentTally'

const MAUBAN_SEAL = '/mauban_logo.jpg'
const ELEARNING_LOGO = '/elearning_logo.png'

export default function AccomplishmentReport() {
  const { user, profile, isAdmin } = useAuth()
  const periods = useMemo(() => buildPeriods(ACCOMPLISHMENT_YEAR), [])
  const [periodId, setPeriodId] = useState(defaultPeriodId(ACCOMPLISHMENT_YEAR))
  const [store, setStore] = useState(null)
  const [columnModal, setColumnModal] = useState(null)
  const [cellModal, setCellModal] = useState(null)
  const [draggingId, setDraggingId] = useState('')
  const [dropId, setDropId] = useState('')
  const [tallyNote, setTallyNote] = useState('')

  const staffName = String(profile?.full_name || '').trim().toLocaleUpperCase()
  const staffTitle = String(profile?.position || '').trim()

  const periodIndex = Math.max(
    0,
    periods.findIndex((row) => row.id === periodId),
  )
  const period = periods[periodIndex] || periods[0]
  const offDays = store?.offDays
  const days = useMemo(() => rowsForPeriod(period, offDays), [period, offDays])
  const shortCount = days.filter((row) => row.off || row.holiday).length
  const workCount = Math.max(days.length - shortCount, 1)
  const columns = store?.columns || []
  const entries = store?.entries || {}

  useEffect(() => {
    if (!user?.id || isAdmin) return
    setStore(readAccomplishmentStore(user.id, profile))
  }, [user?.id, isAdmin, profile])

  useEffect(() => {
    if (!user?.id || !store || isAdmin) return
    writeAccomplishmentStore(user.id, store)
  }, [user?.id, store, isAdmin])

  function goPeriod(step) {
    const next = periods[periodIndex + step]
    if (next) setPeriodId(next.id)
  }

  function printReport() {
    const previousTitle = document.title
    document.title = ' '
    document.body.classList.add('printing-accomplishment')
    const pageStyle = document.createElement('style')
    pageStyle.id = 'ar-print-page-style'
    pageStyle.textContent = `@media print {
      @page { size: 13in 8.5in; margin: 0 !important; }
      html, body, #root { width: 13in !important; height: 8.5in !important; }
    }`
    document.head.appendChild(pageStyle)
    const done = () => {
      document.body.classList.remove('printing-accomplishment')
      document.title = previousTitle
      pageStyle.remove()
    }
    window.addEventListener('afterprint', done, { once: true })
    window.setTimeout(() => window.print(), 50)
  }

  async function pushTally({ nextColumns, nextEntries, dates, outputs }) {
    const linked = (outputs || []).filter(Boolean)
    if (!user?.id || !linked.length || !dates?.length) return
    setTallyNote('Updating the tally…')
    try {
      const saved = await syncAccomplishmentOutputs({
        userId: user.id,
        columns: nextColumns,
        entries: nextEntries,
        dates,
        outputs: linked,
      })
      const counted = saved.filter((row) => row.quantity > 0)
      setTallyNote(
        counted.length
          ? `Tally updated. ${counted.map((row) => `${row.output} on ${row.date} is now ${row.quantity}`).join('; ')}. That day’s count is included in the January–December total.`
          : 'Saved. That date no longer adds to the tally.',
      )
    } catch (err) {
      setTallyNote(err.message || 'The accomplishment was saved, but the tally was not updated.')
    }
  }

  function saveColumn(label) {
    if (columnModal?.mode === 'add') {
      setStore((current) => ({
        ...current,
        columns: [...current.columns, { id: newColumnId(label), label }],
      }))
    } else if (columnModal?.columnId) {
      const previous = columns.find((column) => column.id === columnModal.columnId)
      const nextColumns = renameColumn(columns, columnModal.columnId, label)
      setStore((current) => ({
        ...current,
        columns: nextColumns,
      }))
      void pushTally({
        nextColumns,
        nextEntries: entries,
        dates: Object.keys(entries),
        outputs: [tallyOutputForColumn(previous?.label), tallyOutputForColumn(label)],
      })
    }
    setColumnModal(null)
  }

  function deleteColumn() {
    if (!columnModal?.columnId || columns.length <= 1) return
    const previous = columns.find((column) => column.id === columnModal.columnId)
    const next = removeColumn(columns, entries, columnModal.columnId)
    setStore((current) => (current ? { ...current, columns: next.columns, entries: next.entries } : current))
    setColumnModal(null)
    void pushTally({
      nextColumns: next.columns,
      nextEntries: next.entries,
      dates: Object.keys(entries),
      outputs: [tallyOutputForColumn(previous?.label)],
    })
  }

  function saveCell(text) {
    if (!cellModal) return
    const current = cellText(cellModal.dateKey, cellModal.columnId, entries)
    const nextText = nextCellText(current, text, cellModal.mode)
    const nextEntries = setCellEntry(entries, cellModal.dateKey, cellModal.columnId, nextText)
    const column = columns.find((row) => row.id === cellModal.columnId)
    setStore((prev) => ({
      ...prev,
      entries: nextEntries,
    }))
    setCellModal(null)
    void pushTally({
      nextColumns: columns,
      nextEntries,
      dates: [cellModal.dateKey],
      outputs: [tallyOutputForColumn(column?.label)],
    })
  }

  function endColumnDrag() {
    setDraggingId('')
    setDropId('')
  }

  function toggleOffDay(dayId) {
    setStore((current) => {
      if (!current) return current
      const has = current.offDays.includes(dayId)
      const offDays = has
        ? current.offDays.filter((day) => day !== dayId)
        : [...current.offDays, dayId].sort((a, b) => a - b)
      return { ...current, offDays }
    })
  }

  function dropColumn(targetId) {
    if (!draggingId || !targetId || draggingId === targetId) {
      endColumnDrag()
      return
    }
    setStore((current) => ({
      ...current,
      columns: moveColumn(current.columns, draggingId, targetId),
    }))
    endColumnDrag()
  }

  if (isAdmin) return <Navigate to="/" replace />

  if (!store) return null

  return (
    <div className="ar-page">
      <div className="ar-toolbar print-hide">
        <div>
          <p className="ar-toolbar-kicker">Office form</p>
          <h1 className="ar-toolbar-title">Accomplishment report</h1>
          <p className="ar-toolbar-note">
            Your sheet is saved on this account. Linked columns also update your tally. Read the rules below before you enter a count.
          </p>
          <div className="ar-off-setup" aria-label="Day off weekdays">
            <span>Day off</span>
            {WEEKDAYS.map((day) => (
              <button
                key={day.id}
                type="button"
                className={store.offDays.includes(day.id) ? 'is-off' : ''}
                aria-pressed={store.offDays.includes(day.id)}
                onClick={() => toggleOffDay(day.id)}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setColumnModal({ mode: 'add' })}>
            <Plus size={16} />
            Add column
          </Button>
          <Button variant="secondary" onClick={printReport}>
            <Printer size={16} />
            Print
          </Button>
        </div>
      </div>

      <nav className="ar-period-nav print-hide" aria-label="Report period">
        <button
          type="button"
          className="ar-period-btn"
          disabled={periodIndex <= 0}
          onClick={() => goPeriod(-1)}
          aria-label="Previous period"
        >
          <ChevronLeft size={20} />
        </button>
        <p className="ar-period-label">{period.rangeLabel}</p>
        <button
          type="button"
          className="ar-period-btn"
          disabled={periodIndex >= periods.length - 1}
          onClick={() => goPeriod(1)}
          aria-label="Next period"
        >
          <ChevronRight size={20} />
        </button>
      </nav>

      <section className="ar-rules print-hide" aria-label="How counts reach the tally">
        <h2>How to enter a count</h2>
        <ul>
          {ACCOMPLISHMENT_COUNT_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <h3>Columns that update the tally</h3>
        <table>
          <thead>
            <tr>
              <th>Accomplishment column</th>
              <th>Tally output</th>
            </tr>
          </thead>
          <tbody>
            {ACCOMPLISHMENT_TALLY_LINKS.map((link) => (
              <tr key={link.column}>
                <td>{link.column}</td>
                <td>{link.output}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {tallyNote ? <p className="ar-tally-note">{tallyNote}</p> : null}
      </section>

      <div className="ar-workbook ar-print-page">
        <section className="ar-sheet" aria-label="Accomplishment report sheet">
          <header className="ar-head">
            <div className="ar-head-side">
              <img src={MAUBAN_SEAL} alt="Bayan ng Mauban seal" className="ar-seal" />
            </div>
            <div className="ar-head-center">
              <p>Republic of the Philippines</p>
              <p>Province of Quezon</p>
              <p>Municipality of Mauban</p>
              <h2>Accomplishment</h2>
              <p className="ar-range">{period.rangeLabel}</p>
            </div>
            <div className="ar-head-side ar-head-logo">
              <img src={ELEARNING_LOGO} alt="e-LearningVille Mauban, Quezon" className="ar-brand" />
            </div>
          </header>

          <div className="ar-table-wrap">
            <table
              className="ar-table"
              style={{
                '--ar-row-count': days.length,
                '--ar-short-count': shortCount,
                '--ar-work-count': workCount,
              }}
            >
              <colgroup>
                <col className="ar-col-date" />
                {columns.map((column) => (
                  <col key={column.id} className="ar-col-work" />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th>Date</th>
                  {columns.map((column) => (
                    <th
                      key={column.id}
                      className={`ar-col-draggable${draggingId === column.id ? ' is-dragging' : ''}${dropId === column.id ? ' is-drop' : ''}`}
                      title="Drag to move this column"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', column.id)
                        setDraggingId(column.id)
                      }}
                      onDragOver={(event) => {
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                        if (dropId !== column.id) setDropId(column.id)
                      }}
                      onDrop={(event) => {
                        event.preventDefault()
                        dropColumn(column.id)
                      }}
                      onDragEnd={endColumnDrag}
                    >
                      <div className="ar-col-head">
                        <span className="ar-col-title">{column.label}</span>
                        {tallyOutputForColumn(column.label) ? (
                          <span className="ar-col-link print-hide">
                            Counts toward {tallyOutputForColumn(column.label)}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          className="ar-col-edit print-hide"
                          draggable={false}
                          aria-label={`Edit ${column.label}`}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={() =>
                            setColumnModal({
                              mode: 'edit',
                              columnId: column.id,
                              label: column.label,
                            })
                          }
                        >
                          <Pencil size={12} />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((row) =>
                  row.holiday ? (
                    <tr key={row.key} className="ar-holiday">
                      <td className="ar-date">{row.label}</td>
                      <td colSpan={columns.length} className="ar-holiday-cell">
                        HOLIDAY — {row.holiday}
                      </td>
                    </tr>
                  ) : row.off ? (
                    <tr key={row.key} className="ar-off">
                      <td className="ar-date">{row.label}</td>
                      <td colSpan={columns.length} className="ar-off-cell">
                        DAY OFF
                      </td>
                    </tr>
                  ) : (
                    <tr key={row.key}>
                      <td className="ar-date">{row.label}</td>
                      {columns.map((column) => {
                        const value = cellText(row.key, column.id, entries)
                        return (
                          <td key={column.id}>
                            <div className="ar-cell">
                              <p className="ar-cell-text">{value}</p>
                              <CountActions
                                onAdd={() =>
                                  setCellModal({
                                    mode: 'add',
                                    dateKey: row.key,
                                    dateLabel: row.label,
                                    columnId: column.id,
                                    columnLabel: column.label,
                                    current: value,
                                  })
                                }
                                onUpdate={() =>
                                  setCellModal({
                                    mode: 'update',
                                    dateKey: row.key,
                                    dateLabel: row.label,
                                    columnId: column.id,
                                    columnLabel: column.label,
                                    current: value,
                                  })
                                }
                              />
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>

          <footer className="ar-signs">
            <div className="ar-sign">
              <p className="ar-sign-name">{staffName}</p>
              {staffTitle ? <p className="ar-sign-title">{staffTitle}</p> : null}
            </div>
            <div className="ar-sign">
              <p className="ar-sign-name">{ACCOMPLISHMENT_NOTED.name}</p>
              <p className="ar-sign-title">{ACCOMPLISHMENT_NOTED.title}</p>
            </div>
          </footer>
        </section>
      </div>

      {columnModal && (
        <ColumnEditModal
          mode={columnModal.mode}
          current={columnModal.label || ''}
          canDelete={columnModal.mode === 'edit' && columns.length > 1}
          onClose={() => setColumnModal(null)}
          onSave={saveColumn}
          onDelete={deleteColumn}
        />
      )}
      {cellModal && (
        <CellEditModal
          mode={cellModal.mode}
          title={cellModal.columnLabel}
          detail={cellModal.dateLabel}
          current={cellModal.current}
          onClose={() => setCellModal(null)}
          onConfirm={saveCell}
        />
      )}
    </div>
  )
}
