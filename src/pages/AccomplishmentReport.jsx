import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Pencil, Plus, Printer } from 'lucide-react'
import { Button } from '../components/ui'
import { CountActions } from '../components/CountEditModal'
import { CellEditModal, ColumnEditModal } from '../components/AccomplishmentModals'
import {
  ACCOMPLISHMENT_SIGNERS,
  ACCOMPLISHMENT_YEAR,
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

const MAUBAN_SEAL = '/mauban_logo.jpg'
const ELEARNING_LOGO = '/elearning_logo.png'

export default function AccomplishmentReport() {
  const periods = useMemo(() => buildPeriods(ACCOMPLISHMENT_YEAR), [])
  const [periodId, setPeriodId] = useState(defaultPeriodId(ACCOMPLISHMENT_YEAR))
  const [store, setStore] = useState(() => readAccomplishmentStore())
  const [columnModal, setColumnModal] = useState(null)
  const [cellModal, setCellModal] = useState(null)
  const [draggingId, setDraggingId] = useState('')
  const [dropId, setDropId] = useState('')

  const periodIndex = Math.max(
    0,
    periods.findIndex((row) => row.id === periodId),
  )
  const period = periods[periodIndex] || periods[0]
  const days = useMemo(() => rowsForPeriod(period), [period])
  const shortCount = days.filter((row) => row.off || row.holiday).length
  const workCount = Math.max(days.length - shortCount, 1)
  const { columns, entries } = store

  useEffect(() => {
    writeAccomplishmentStore(store)
  }, [store])

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

  function saveColumn(label) {
    if (columnModal?.mode === 'add') {
      setStore((current) => ({
        ...current,
        columns: [...current.columns, { id: newColumnId(label), label }],
      }))
    } else if (columnModal?.columnId) {
      setStore((current) => ({
        ...current,
        columns: renameColumn(current.columns, columnModal.columnId, label),
      }))
    }
    setColumnModal(null)
  }

  function deleteColumn() {
    if (!columnModal?.columnId || columns.length <= 1) return
    setStore((current) => {
      const next = removeColumn(current.columns, current.entries, columnModal.columnId)
      return { columns: next.columns, entries: next.entries }
    })
    setColumnModal(null)
  }

  function saveCell(text) {
    if (!cellModal) return
    const current = cellText(cellModal.dateKey, cellModal.columnId, entries)
    const next = nextCellText(current, text, cellModal.mode)
    setStore((prev) => ({
      ...prev,
      entries: setCellEntry(prev.entries, cellModal.dateKey, cellModal.columnId, next),
    }))
    setCellModal(null)
  }

  function endColumnDrag() {
    setDraggingId('')
    setDropId('')
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

  return (
    <div className="ar-page">
      <div className="ar-toolbar print-hide">
        <div>
          <p className="ar-toolbar-kicker">Office form</p>
          <h1 className="ar-toolbar-title">Accomplishment report</h1>
          <p className="ar-toolbar-note">
            Date stays fixed. Drag a column header to move it. Add or edit columns and row entries
            with the buttons — nothing is typed in the grid.
          </p>
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
              <p className="ar-sign-name">{ACCOMPLISHMENT_SIGNERS.prepared.name}</p>
              <p className="ar-sign-title">{ACCOMPLISHMENT_SIGNERS.prepared.title}</p>
            </div>
            <div className="ar-sign">
              <p className="ar-sign-name">{ACCOMPLISHMENT_SIGNERS.noted.name}</p>
              <p className="ar-sign-title">{ACCOMPLISHMENT_SIGNERS.noted.title}</p>
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
