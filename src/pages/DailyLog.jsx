import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'
import { writeAudit } from '../lib/audit'
import { groupItemsBySection, sectionLabel } from '../lib/coreFunctions'
import { formatCount, toCount } from '../lib/opcr'
import {
  DAILY_SEMESTERS,
  dailySemesterId,
  formatWorkDate,
  loadDailyContext,
  logsForDate,
  readDailyCache,
  saveDailyLogs,
  semesterCaption,
  semesterDateBounds,
  shiftToSemester,
  todayValue,
  workYear,
  yearTotal,
  writeDailyCache,
} from '../lib/daily'
import { Alert, EmptyState, LoadingState, PageHeader, Segmented, Toast, useToast } from '../components/ui'
import CountEditModal, { CountActions } from '../components/CountEditModal'

export default function DailyLog() {
  const { user } = useAuth()
  const { toast, toastPhase, showToast, clearToast } = useToast()
  const initialCache = useMemo(() => readDailyCache(user?.id), [user?.id])
  const [period, setPeriod] = useState(initialCache?.period || null)
  const [staff, setStaff] = useState(initialCache?.staff || null)
  const [items, setItems] = useState(initialCache?.items || [])
  const [logs, setLogs] = useState(initialCache?.logs || [])
  const [workDate, setWorkDate] = useState(todayValue())
  const [semester, setSemester] = useState(() => dailySemesterId(todayValue()))
  const [quantities, setQuantities] = useState({})
  const [notes, setNotes] = useState({})
  const [loading, setLoading] = useState(!initialCache)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [countModal, setCountModal] = useState(null)
  const userRef = useRef(user)
  const quantitiesRef = useRef({})
  const notesRef = useRef({})
  const logsRef = useRef([])
  const itemsRef = useRef([])
  const workDateRef = useRef(workDate)
  const periodRef = useRef(period)
  const staffRef = useRef(staff)
  const savingRef = useRef(false)

  useEffect(() => {
    userRef.current = user
  }, [user])

  useEffect(() => {
    quantitiesRef.current = quantities
  }, [quantities])

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  useEffect(() => {
    logsRef.current = logs
  }, [logs])

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    workDateRef.current = workDate
  }, [workDate])

  useEffect(() => {
    periodRef.current = period
  }, [period])

  useEffect(() => {
    staffRef.current = staff
  }, [staff])

  async function load({ silent = false, force = false } = {}) {
    const currentUser = userRef.current
    if (!supabase || !currentUser) {
      setLoading(false)
      return
    }
    if (silent && !force && savingRef.current) return
    if (!silent) setLoading(true)
    setError('')
    try {
      const context = await loadDailyContext(supabase, currentUser.id)
      setPeriod(context.period)
      setStaff(context.staff)
      setItems(context.items)
      setLogs(context.logs)
      writeDailyCache({
        userId: currentUser.id,
        period: context.period,
        staff: context.staff,
        items: context.items,
        logs: context.logs,
      })
      if (!context.period) {
        setError('No active OPCR period is set. Ask an admin to run the seed SQL.')
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    let active = true

    async function start() {
      const cached = readDailyCache(user?.id)
      try {
        if (cached) {
          setPeriod(cached.period || null)
          setStaff(cached.staff || null)
          setItems(cached.items || [])
          setLogs(cached.logs || [])
          setLoading(false)
          await load({ silent: true })
        } else {
          await load({ silent: false })
        }
      } catch (err) {
        if (active) {
          setError(err.message)
          setLoading(false)
        }
      }
    }

    start()
    const poll = window.setInterval(() => {
      load({ silent: true })
    }, 12000)
    return () => {
      active = false
      window.clearInterval(poll)
    }
  }, [user?.id])

  useEffect(() => {
    const dayLogs = logsForDate(logs, workDate)
    const byItem = Object.fromEntries(dayLogs.map((row) => [row.item_id, row]))
    const nextQty = {}
    const nextNotes = {}
    for (const item of items) {
      const row = byItem[item.id] || byItem[item.person_item_id]
      if (!row) continue
      nextQty[item.id] = String(toCount(row.quantity) || '')
      nextNotes[item.id] = row.notes || ''
    }
    setQuantities(nextQty)
    setNotes(nextNotes)
  }, [logs, workDate, items])

  const pendingRows = items.filter((item) => item.pending)
  const grouped = useMemo(() => {
    const buckets = groupItemsBySection(items)
    const bySection = Object.fromEntries(buckets.map((group) => [group.section, group]))
    return [1, 2]
      .map((section) => bySection[section] || { section, category: sectionLabel(section), items: [] })
      .filter((group) => group.items.length > 0)
  }, [items])

  const logByItem = useMemo(() => {
    const map = {}
    for (const row of logsForDate(logs, workDate)) map[row.item_id] = row
    return map
  }, [logs, workDate])

  function dayLogForItem(item) {
    return logByItem[item.id] || logByItem[item.person_item_id] || null
  }

  const dateBounds = semesterDateBounds(workYear(workDate) || new Date().getFullYear(), semester)
  const semLabel = semesterCaption(workDate, semester)
  const dayLabel = formatWorkDate(workDate)

  async function save({ nextQuantities = quantitiesRef.current, quiet = false } = {}) {
    const currentPeriod = periodRef.current
    const currentStaff = staffRef.current
    const currentUser = userRef.current
    const currentDate = workDateRef.current
    if (!currentPeriod || !currentStaff || !currentUser) return
    savingRef.current = true
    setSaving(true)
    if (!quiet) {
      setError('')
      clearToast()
    }
    try {
      const dayLogs = logsForDate(logsRef.current, currentDate)
      const logMap = Object.fromEntries(dayLogs.map((row) => [row.item_id, row]))
      const year = workYear(currentDate)
      const carryOn = currentDate === `${year}-01-01` ? `${year}-01-02` : `${year}-01-01`
      const carryLogs = logsForDate(logsRef.current, carryOn)
      const carryMap = Object.fromEntries(carryLogs.map((row) => [row.item_id, row]))
      const carryRows = itemsRef.current
        .filter((item) => item.id && !item.pending)
        .map((item) => {
          const ids = [...new Set([item.id, item.person_item_id].filter(Boolean))]
          const dailySum = ids.reduce(
            (sum, id) => sum + yearTotal(logsRef.current, id, currentDate),
            0,
          )
          const gap = toCount(item.board_actual) - dailySum
          if (gap <= 0) return null
          const existing = carryMap[item.id] || carryMap[item.person_item_id]
          return {
            item_id: item.id,
            quantity: toCount(existing?.quantity) + gap,
            notes: existing?.notes || '',
            log_id: existing?.id,
          }
        })
        .filter(Boolean)
      if (carryRows.length) {
        await saveDailyLogs(supabase, {
          periodId: currentPeriod.id,
          staffId: currentStaff.id,
          userId: currentUser.id,
          workDate: carryOn,
          rows: carryRows,
        })
      }
      const rows = itemsRef.current
        .filter((item) => item.id && !item.pending)
        .map((item) => {
          const existing = logMap[item.id] || logMap[item.person_item_id]
          return {
            item_id: item.id,
            quantity: nextQuantities[item.id],
            notes: notesRef.current[item.id],
            log_id: existing?.id,
            keep: Boolean(existing),
          }
        })
      await saveDailyLogs(supabase, {
        periodId: currentPeriod.id,
        staffId: currentStaff.id,
        userId: currentUser.id,
        workDate: currentDate,
        rows,
      })
      await load({ silent: true, force: true })
      if (!quiet) {
        const filled = rows.filter((row) => toCount(row.quantity) > 0).length
        await writeAudit(
          supabase,
          'Saved daily accomplishments',
          'Daily log',
          `${currentDate} · ${filled} item${filled === 1 ? '' : 's'}`,
        )
        showToast('Count saved. The tally board is updated.')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function changeWorkDate(nextDate) {
    if (!nextDate || nextDate === workDateRef.current) return
    setWorkDate(nextDate)
    setSemester(dailySemesterId(nextDate))
  }

  async function changeSemester(nextId) {
    if (nextId === semester || savingRef.current) return
    setSemester(nextId)
    setWorkDate(shiftToSemester(workDateRef.current, nextId))
  }

  function openCountModal(mode, item) {
    if (!staff || item.pending || !item.id) return
    setCountModal({
      mode,
      itemId: item.id,
      current: toCount(quantities[item.id]),
      note: notes[item.id] || '',
      title: item.output || 'Output',
      detail: `${dayLabel} · ${semLabel}`,
    })
  }

  async function confirmCountModal(nextValue, noteText = '') {
    if (!countModal) return
    const itemId = countModal.itemId
    const nextQuantities = {
      ...quantitiesRef.current,
      [itemId]: nextValue ? String(nextValue) : '',
    }
    const existingNote = String(notesRef.current[itemId] || '').trim()
    const typedNote = String(noteText || '').trim()
    const nextNote =
      countModal.mode === 'add'
        ? typedNote
          ? existingNote
            ? `${existingNote}\n${typedNote}`
            : typedNote
          : existingNote
        : typedNote
    const nextNotes = { ...notesRef.current, [itemId]: nextNote }
    quantitiesRef.current = nextQuantities
    notesRef.current = nextNotes
    setQuantities(nextQuantities)
    setNotes(nextNotes)
    setCountModal(null)
    await save({ nextQuantities, quiet: false })
  }

  if (loading) return <LoadingState label="Loading daily log…" />

  return (
    <div className="daily-log w-full space-y-4 pb-8">
      <PageHeader
        kicker={period?.office_name || 'E-Learning Ville'}
        title="Daily accomplishments"
        description="Add or update this day’s count for your assigned outputs. Notes are inside Add or Update. Changes save automatically."
      />

      <section className="daily-toolbar card">
        <div className="daily-toolbar-field">
          <label id="daily-semester-label">Semester</label>
          <div
            className="daily-toolbar-control"
            role="group"
            aria-labelledby="daily-semester-label"
          >
            <Segmented
              value={semester}
              onChange={(id) => void changeSemester(id)}
              options={DAILY_SEMESTERS.map((row) => ({ id: row.id, label: row.label }))}
            />
          </div>
        </div>
        <div className="daily-toolbar-field">
          <label htmlFor="daily-work-date">Date</label>
          <div className="daily-toolbar-control">
            <input
              id="daily-work-date"
              type="date"
              className="field"
              min={dateBounds.min}
              max={dateBounds.max}
              value={workDate}
              onChange={(event) => void changeWorkDate(event.target.value)}
            />
          </div>
        </div>
        <div className="daily-toolbar-field">
          <label>Day</label>
          <div className="daily-toolbar-day">
            <strong>{dayLabel}</strong>
            <span>
              January–December totals match the tally board
            </span>
          </div>
        </div>
      </section>

      {error && <Alert tone="danger">{error}</Alert>}

      {!staff && (
        <Alert tone="warning">
          Your login is not linked to a staff account yet. Ask an admin to add you on{' '}
          <strong>Users</strong> so you can log daily accomplishments.
        </Alert>
      )}

      {pendingRows.length > 0 && (
        <Alert tone="warning">
          {pendingRows.length === 1 ? 'One OPCR row is' : `${pendingRows.length} OPCR rows are`} not
          linked to the tally yet. Open <strong>My OPCR</strong>, click Save, after running{' '}
          <strong>supabase/opcr_tally_sync.sql</strong>. Then this page can take counts for those
          rows.
        </Alert>
      )}

      <div className={`function-split-grid ${grouped.length === 1 ? 'is-single' : ''}`}>
        {grouped.map((group) => (
          <section key={group.section} className="card overflow-hidden">
            <div className="border-b border-amber-200 bg-amber-100 px-4 py-2.5">
              <h2 className="text-sm font-bold tracking-wide text-amber-950 uppercase">
                {group.category}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="daily-log-table text-left text-sm">
                <colgroup>
                  <col className="daily-col-output" />
                  <col className="daily-col-count" />
                  <col className="daily-col-total" />
                </colgroup>
                <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Output</th>
                    <th className="px-2 py-2.5 text-center font-semibold">Count</th>
                    <th className="px-2 py-2.5 text-center font-semibold">
                      Total
                      <span className="mt-0.5 block text-[10px] font-medium tracking-normal text-slate-400 normal-case">
                        Jan–Dec {workYear(workDate)}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item) => {
                    const itemKey = item.id || item.entry_id
                    const dayLog = dayLogForItem(item)
                    const typed = toCount(quantities[item.id])
                    const shownTotal = Math.max(
                      0,
                      toCount(item.board_actual) - toCount(dayLog?.quantity) + typed,
                    )
                    return (
                      <tr key={itemKey} className="border-t border-slate-100">
                        <td className="px-4 py-2.5 align-middle font-semibold text-slate-900">
                          {item.output || 'New row'}
                          {item.pending && (
                            <span className="mt-1 block text-xs font-medium text-amber-700">
                              Save My OPCR to enable counting
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 align-middle text-center">
                          <p className="daily-count-value text-base font-bold text-slate-900">
                            {formatCount(typed)}
                          </p>
                          {staff && !item.pending && item.id ? (
                            <CountActions
                              disabled={saving}
                              onAdd={() => openCountModal('add', item)}
                              onUpdate={() => openCountModal('update', item)}
                            />
                          ) : null}
                        </td>
                        <td className="px-2 py-2.5 align-middle text-center">
                          <span className="text-base font-bold text-teal-800">
                            {formatCount(shownTotal)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      {staff && items.length === 0 && (
        <EmptyState
          title="No assigned targets"
          body="Outputs with a target assigned to you, or with an existing count, appear here. Ask an admin to set your targets on the Tally board."
        />
      )}

      {countModal && (
        <CountEditModal
          mode={countModal.mode}
          title={countModal.title}
          detail={countModal.detail}
          current={countModal.current}
          showNote
          currentNote={countModal.note || ''}
          saving={saving}
          onClose={() => setCountModal(null)}
          onConfirm={confirmCountModal}
        />
      )}
      <Toast message={toast} phase={toastPhase} />
    </div>
  )
}
