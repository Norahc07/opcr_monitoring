import { useEffect, useMemo, useRef, useState } from 'react'
import { Printer } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'
import { writeAudit } from '../lib/audit'
import { Alert, Button, LoadingState, PageHeader, Segmented, Toast, useToast } from '../components/ui'
import CountEditModal, { CountActions } from '../components/CountEditModal'
import {
  annualPeriodLabel,
  buildBoardRows,
  clearBoardCache,
  formatCount,
  loadTallyContext,
  patchBoardCacheRow,
  personTableHeader,
  readBoardCache,
  saveAdminTallies,
  saveStaffTallies,
  TALLY_PERIOD_ID,
  tallyKey,
  toCount,
  writeBoardCache,
} from '../lib/opcr'
import { groupItemsBySection } from '../lib/coreFunctions'

function rowTotal(people, itemId, rows, field) {
  return people.reduce((sum, person) => {
    const row = rows[tallyKey(person.id, itemId, TALLY_PERIOD_ID)]
    return sum + toCount(row?.[field])
  }, 0)
}

function statusTone(accomplished, target) {
  const goal = toCount(target)
  if (goal <= 0) return 'neutral'
  return toCount(accomplished) >= goal ? 'met' : 'short'
}

const TONE_TEXT = {
  met: 'text-blue-600',
  short: 'text-orange-600',
  neutral: 'text-slate-900',
}

function StaffHeader({ person }) {
  const { primary, secondary, title } = personTableHeader(person)
  return (
    <div className="tally-staff-head" title={title}>
      <p className="tally-staff-primary">{primary}</p>
      {secondary ? <p className="tally-staff-secondary">{secondary}</p> : null}
    </div>
  )
}

function TallyTargetLine({ show, target, toneClass }) {
  if (!show) return null
  const hasTarget = toCount(target) > 0
  return (
    <p className={`tally-cell-target ${hasTarget ? toneClass : 'invisible'}`}>
      Target {formatCount(target)}
    </p>
  )
}

export default function TallyBoard() {
  const { user, isAdmin } = useAuth()
  const { toast, toastPhase, toastTone, showToast } = useToast()
  const cached = useMemo(() => readBoardCache(), [])
  const [period, setPeriod] = useState(cached?.period || null)
  const [items, setItems] = useState(cached?.items || [])
  const [people, setPeople] = useState(cached?.people || [])
  const [rows, setRows] = useState(cached?.rows || {})
  const [view, setView] = useState('accomplished')
  const [loading, setLoading] = useState(!cached)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState({})
  const [countModal, setCountModal] = useState(null)
  const dirtyRef = useRef({})
  const recentlySavedRef = useRef(new Set())
  const applyTallyChangeRef = useRef(null)
  const showToastRef = useRef(showToast)
  const rowsRef = useRef({})
  const saveTimer = useRef(null)
  const isAdminRef = useRef(isAdmin)
  const periodRef = useRef(period)
  const userRef = useRef(user)

  const year = Math.max(Number(period?.year) || 0, new Date().getFullYear())
  const isTargetView = isAdmin && view === 'target'
  const field = isTargetView ? 'target' : 'accomplished'

  const myStaff = useMemo(
    () => people.find((person) => person.user_id === user?.id) || null,
    [people, user?.id],
  )
  const myStaffId = myStaff?.id
  const isTargetViewRef = useRef(isTargetView)
  const myStaffIdRef = useRef(myStaffId)

  const tablePeople = useMemo(() => people.filter((person) => person.user_id), [people])

  function canEditCell(personId) {
    if (isAdmin) return true
    return Boolean(myStaffId && personId === myStaffId)
  }

  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  useEffect(() => {
    isTargetViewRef.current = isTargetView
    isAdminRef.current = isAdmin
    myStaffIdRef.current = myStaffId
    periodRef.current = period
    userRef.current = user
  }, [isTargetView, isAdmin, myStaffId, period, user])

  useEffect(() => {
    if (!isAdmin) setView('accomplished')
  }, [isAdmin])

  useEffect(() => {
    const legacy = Object.keys(cached?.rows || {}).some(
      (key) => key.includes(':jan_june') || key.includes(':july_dec'),
    )
    if (legacy) clearBoardCache()
    loadData({ silent: Boolean(cached) && !legacy })
  }, [])

  useEffect(() => {
    if (!supabase) return undefined
    const channel = supabase
      .channel('office-tally-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'opcr_tallies' },
        (payload) => {
          const tally = payload.new
          if (!tally?.item_id || !tally?.semester) return
          applyTallyChangeRef.current?.(tally, { notice: 'Updated from a staff save.' })
        },
      )
      .subscribe()

    const poll = window.setInterval(() => {
      loadData({ silent: true })
    }, 12000)

    return () => {
      supabase.removeChannel(channel)
      window.clearInterval(poll)
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [])

  function applyTallyChange(tally, options = {}) {
    const personId = tally.staff_id || tally.user_id
    if (!personId || !tally.item_id) return
    const key = tallyKey(personId, tally.item_id, TALLY_PERIOD_ID)
    const keepLocalTarget = isTargetViewRef.current && Boolean(dirtyRef.current[key])
    const keepLocalAccomplished = !isTargetViewRef.current && Boolean(dirtyRef.current[key])
    setRows((current) => {
      const existing = current[key] || {
        staff_id: personId,
        user_id: tally.user_id || null,
        item_id: tally.item_id,
        semester: TALLY_PERIOD_ID,
        target: '',
        accomplished: '',
      }
      const next = {
        ...existing,
        accomplished: keepLocalAccomplished
          ? existing.accomplished
          : String(toCount(tally.accomplished ?? existing.accomplished)),
        target: keepLocalTarget
          ? existing.target
          : String(toCount(tally.target ?? existing.target)),
      }
      return { ...current, [key]: next }
    })
    patchBoardCacheRow(tally)
    if (
      options.notice &&
      !dirtyRef.current[key] &&
      !recentlySavedRef.current.has(key)
    ) {
      showToastRef.current(options.notice)
    }
  }

  applyTallyChangeRef.current = applyTallyChange
  showToastRef.current = showToast

  async function loadData({ silent = false } = {}) {
    if (!silent) setLoading(true)
    setError('')
    try {
      const context = await loadTallyContext(supabase, { includePeople: true })
      if (!context.period) {
        setError('No active OPCR period is set. Ask an admin to run the seed SQL.')
        setLoading(false)
        return
      }

      const nextRows = buildBoardRows(
        context.people,
        context.items,
        context.tallies,
        context.personItemByOutput,
      )
      setPeriod(context.period)
      setItems(context.items)
      setPeople(context.people)
      setRows((current) => {
        if (!Object.keys(dirtyRef.current).length) return nextRows
        const merged = { ...nextRows }
        for (const key of Object.keys(dirtyRef.current)) {
          if (current[key]) merged[key] = current[key]
        }
        return merged
      })
      if (!Object.keys(dirtyRef.current).length) setDirty({})
      writeBoardCache({
        period: context.period,
        items: context.items,
        people: context.people,
        rows: nextRows,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const grouped = useMemo(() => groupItemsBySection(items), [items])

  function updateCell(personId, itemId, value) {
    if (!canEditCell(personId)) return
    const key = tallyKey(personId, itemId, TALLY_PERIOD_ID)
    const person = people.find((row) => row.id === personId)
    const existing = rowsRef.current[key] || {
      staff_id: personId,
      user_id: person?.user_id || user?.id || null,
      item_id: itemId,
      semester: TALLY_PERIOD_ID,
      target: '',
      accomplished: '',
    }
    const nextValue = toCount(value)
    const nextRow = { ...existing, [field]: nextValue ? String(nextValue) : '' }
    const nextRows = { ...rowsRef.current, [key]: nextRow }
    rowsRef.current = nextRows
    setRows(nextRows)
    const nextDirty = { ...dirtyRef.current, [key]: true }
    dirtyRef.current = nextDirty
    setDirty(nextDirty)
    if (period && items.length && people.length) {
      writeBoardCache({
        period,
        items,
        people,
        rows: nextRows,
      })
    }
    void flushAutoSave()
  }

  function openCountModal(mode, person, item) {
    if (!canEditCell(person.id)) return
    const key = tallyKey(person.id, item.id, TALLY_PERIOD_ID)
    const current = toCount(rowsRef.current[key]?.[field])
    const { primary } = personTableHeader(person)
    setCountModal({
      mode,
      personId: person.id,
      itemId: item.id,
      current,
      title: item.output,
      detail: `${primary} · ${isTargetView ? 'Target' : 'Accomplishment'} · Jan–Dec ${year}`,
    })
  }

  async function confirmCountModal(nextValue) {
    if (!countModal) return
    updateCell(countModal.personId, countModal.itemId, nextValue)
    setCountModal(null)
  }

  function flushAutoSave() {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    return persistDirtyRows()
  }

  async function persistDirtyRows(options = {}) {
    const activePeriod = periodRef.current
    const activeUser = userRef.current
    if (!activePeriod || !activeUser) return

    const targetView = options.targetView ?? isTargetViewRef.current
    const admin = isAdminRef.current
    const staffId = myStaffIdRef.current
    const currentRows = rowsRef.current

    let payload = Object.keys(dirtyRef.current)
      .map((key) => currentRows[key])
      .filter(Boolean)

    if (!targetView && !admin) {
      if (!staffId) return
      payload = payload.filter((row) => row.staff_id === staffId)
    }
    if (!payload.length) return

    setSaving(true)
    setError('')
    try {
      if (admin) {
        await saveAdminTallies(supabase, activePeriod.id, payload)
      } else {
        await saveStaffTallies(
          supabase,
          activePeriod.id,
          staffId,
          activeUser.id,
          payload.map((row) => ({
            item_id: row.item_id,
            semester: row.semester,
            accomplished: row.accomplished,
          })),
        )
      }

      const remaining = { ...dirtyRef.current }
      const savedKeys = payload.map((row) => tallyKey(row.staff_id, row.item_id, row.semester))
      for (const key of savedKeys) {
        delete remaining[key]
        recentlySavedRef.current.add(key)
      }
      setDirty(remaining)
      window.setTimeout(() => {
        for (const key of savedKeys) recentlySavedRef.current.delete(key)
      }, 2500)
      writeBoardCache({
        period: activePeriod,
        items,
        people,
        rows: currentRows,
      })
      await writeAudit(
        supabase,
        targetView ? 'Saved targets' : 'Saved accomplishments',
        'Tally board',
        `${payload.length} cell${payload.length === 1 ? '' : 's'}`,
      )
      showToast(targetView ? 'Targets saved.' : 'Changes saved.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function changeView(nextView) {
    if (view === nextView) return
    if (Object.keys(dirtyRef.current).length > 0) {
      void persistDirtyRows({ targetView: view === 'target' })
    }
    setView(nextView)
  }

  function printTally() {
    document.body.classList.add('printing-tally')
    const done = () => document.body.classList.remove('printing-tally')
    window.addEventListener('afterprint', done, { once: true })
    window.setTimeout(() => window.print(), 50)
  }

  if (loading && !period) return <LoadingState label="Loading office tally…" />

  const totalColHeader = (
    <>
      <span className="tally-total-title block text-sm">Total</span>
      <span className="tally-total-kind block text-xs font-semibold normal-case tracking-normal">
        {isTargetView ? 'Target' : 'Accomplishment'}
      </span>
      <span className="block text-xs font-semibold normal-case tracking-normal">
        Jan–Dec {year}
      </span>
    </>
  )

  return (
    <div className="tally-board w-full space-y-5 pb-20 print:space-y-0 print:pb-0">
      <div className="print-hide">
      <PageHeader
        kicker={period?.office_name}
        title="Office tally sheet"
        description={
          isAdmin
            ? isTargetView
              ? 'Set each person’s targets below. Use Add to increase a count, or Update to replace it.'
              : 'Use Add to increase a count, or Update to replace it. Blue means the target is met; orange means it is not yet.'
            : 'Use Add or Update in your column (highlighted). Changes appear on the admin board automatically.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <Segmented
                value={view}
                onChange={changeView}
                options={[
                  { id: 'target', label: 'Target' },
                  { id: 'accomplished', label: 'Accomplishments' },
                ]}
              />
            )}
            <Button variant="secondary" onClick={printTally}>
              <Printer size={16} />
              Print
            </Button>
          </div>
        }
      />
      </div>

      {error && (
        <div className="print-hide">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <div className="print-hide">
      <Alert tone={isTargetView ? 'warning' : 'info'}>
        {isTargetView ? (
          <>
            Enter <strong>targets</strong> for each person. Use <strong>Add</strong> or{' '}
            <strong>Update</strong>. Changes save automatically.
          </>
        ) : isAdmin ? (
          <>
            Use <strong>Add</strong> or <strong>Update</strong> for any staff for January–December{' '}
            {year}. Changes save automatically. Blue means the target is met; orange means not yet.
          </>
        ) : myStaffId ? (
          <>
            Your column is highlighted. Use <strong>Add</strong> or <strong>Update</strong> for
            January–December {year}. Changes save automatically. Blue means the target is met;
            orange means not yet.
          </>
        ) : (
          <>
            Your login is not linked to a staff account yet. Ask an admin to add you on{' '}
            <strong>Users</strong> so you can add your accomplishments.
          </>
        )}
      </Alert>
      </div>

      {tablePeople.length === 0 && (
        <div className="print-hide">
        <Alert tone="warning">
          No staff accounts yet. Create logins in Supabase, then run{' '}
          <strong>supabase/staffs.sql</strong> in the SQL editor — or add staff on Users.
        </Alert>
        </div>
      )}

      {grouped.map((group) => (
        <section key={group.category} className="card overflow-hidden tally-print-page">
          <header className="tally-print-heading">
            <p className="tally-print-kicker">{period?.office_name || 'E-Learning Ville'}</p>
            <h1>Office tally sheet</h1>
            <p>
              {isTargetView ? 'Targets' : 'Accomplishments'} · January to December {year}
            </p>
          </header>
          <div className="border-b border-amber-200 bg-amber-100 px-4 py-2.5 tally-print-section-head">
            <h2 className="text-sm font-bold tracking-wide text-amber-950 uppercase">
              {group.category}
            </h2>
          </div>
          <div className="table-scroll tally-print-fill">
            <table className="tally-table w-full text-left text-sm">
              <colgroup>
                <col className="tally-col-output" />
                {tablePeople.map((person) => (
                  <col key={person.id} className="tally-col-staff" />
                ))}
                <col className="tally-col-total" />
              </colgroup>
              <thead>
                <tr className="bg-slate-100 text-sm tracking-wide text-slate-600 uppercase">
                  <th
                    className="tally-col-output sticky left-0 z-20 bg-slate-100 px-4 py-2 font-semibold"
                    rowSpan={2}
                  >
                    Output
                  </th>
                  {tablePeople.length > 0 && (
                    <th
                      colSpan={tablePeople.length}
                      className="tally-staff-group-head border-l border-slate-200 px-2 py-2 text-center text-sm font-semibold text-teal-900"
                    >
                      {isTargetView ? 'Staff targets' : 'Staff accomplishments'}
                    </th>
                  )}
                  <th
                    className="tally-col-total tally-total-head border-l border-slate-200 bg-teal-50 px-2 py-2 text-center font-semibold text-teal-900"
                    rowSpan={2}
                  >
                    {totalColHeader}
                  </th>
                </tr>
                <tr className="bg-slate-50 text-xs text-slate-600">
                  {tablePeople.map((person) => (
                    <th
                      key={person.id}
                      className={`tally-col-staff border-l border-slate-200 px-1.5 py-2 text-center align-top ${
                        person.id === myStaffId ? 'bg-teal-50' : ''
                      }`}
                    >
                      <StaffHeader person={person} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.items.map((item) => {
                  const itemTarget = rowTotal(tablePeople, item.id, rows, 'target')
                  const itemAccomp = rowTotal(tablePeople, item.id, rows, 'accomplished')
                  const total = isTargetView ? itemTarget : itemAccomp
                  const totalTone = isTargetView ? 'neutral' : statusTone(itemAccomp, itemTarget)
                  return (
                    <tr key={item.id} className="bg-slate-50/40">
                      <td className="sticky left-0 z-10 bg-slate-50 px-4 py-3">
                        <p className="font-semibold text-slate-900">
                          {item.output}
                        </p>
                        <p className="tally-output-period mt-0.5 text-xs font-medium text-slate-600">
                          {annualPeriodLabel(year)}
                        </p>
                      </td>
                      {tablePeople.map((person) => {
                        const key = tallyKey(person.id, item.id, TALLY_PERIOD_ID)
                        const row = rows[key]
                        const value = row?.[field] ?? ''
                        const targetValue = row?.target ?? ''
                        const display = formatCount(value)
                        const editable = canEditCell(person.id)
                        const tone = isTargetView
                          ? 'neutral'
                          : statusTone(row?.accomplished, targetValue)
                        const zero = toCount(value) <= 0
                        return (
                          <td
                            key={person.id}
                            className={`tally-staff-cell border-l border-white/60 px-2 py-2 text-center ${
                              person.id === myStaffId ? 'bg-teal-50/80' : ''
                            }`}
                          >
                            <div className="tally-cell">
                              <p
                                className={`tally-cell-readonly rounded-lg bg-white px-2 py-1.5 text-base font-bold ${
                                  zero && tone === 'neutral' ? 'text-slate-400' : TONE_TEXT[tone]
                                }`}
                              >
                                {display}
                              </p>
                              {editable ? (
                                <CountActions
                                  onAdd={() => openCountModal('add', person, item)}
                                  onUpdate={() => openCountModal('update', person, item)}
                                />
                              ) : (
                                <div className="count-actions print-hide" aria-hidden="true" />
                              )}
                              <TallyTargetLine
                                show={!isTargetView}
                                target={targetValue}
                                toneClass={TONE_TEXT[tone]}
                              />
                            </div>
                          </td>
                        )
                      })}
                      <td className="tally-col-total border-l border-slate-200 bg-teal-50/80 px-2 py-2 text-center">
                        <div className="tally-cell">
                          <span
                            className={`text-lg font-bold ${isTargetView ? 'text-teal-900' : TONE_TEXT[totalTone]}`}
                          >
                            {formatCount(total)}
                          </span>
                          <TallyTargetLine
                            show={!isTargetView}
                            target={itemTarget}
                            toneClass={TONE_TEXT[totalTone]}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {countModal && (
        <CountEditModal
          mode={countModal.mode}
          title={countModal.title}
          detail={countModal.detail}
          current={countModal.current}
          saving={saving}
          onClose={() => setCountModal(null)}
          onConfirm={confirmCountModal}
        />
      )}
      <Toast message={toast} phase={toastPhase} tone={toastTone} />
    </div>
  )
}
