import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'
import { Alert, Button, LoadingState, PageHeader, Segmented, Toast, useToast } from '../components/ui'
import {
  buildBoardRows,
  formatCount,
  loadTallyContext,
  patchBoardCacheRow,
  personTableHeader,
  readBoardCache,
  saveAdminTallies,
  saveStaffTallies,
  SEMESTERS,
  semesterPeriodLabel,
  tallyKey,
  toCount,
  writeBoardCache,
} from '../lib/opcr'
import { coreFunctionLabel, orderCoreFunctionItems } from '../lib/coreFunctions'

function rowTotal(people, itemId, semester, rows, field) {
  return people.reduce((sum, person) => {
    const row = rows[tallyKey(person.id, itemId, semester)]
    return sum + toCount(row?.[field])
  }, 0)
}

function statusTone(accomplished, target) {
  const goal = toCount(target)
  if (goal <= 0) return 'neutral'
  return toCount(accomplished) >= goal ? 'met' : 'short'
}

const TONE_TEXT = {
  met: 'text-green-600',
  short: 'text-red-600',
  neutral: 'text-slate-900',
}

function StaffHeader({ person }) {
  const { primary, secondary } = personTableHeader(person)
  return (
    <div className="px-1 py-1">
      <p className="text-sm font-bold text-slate-900">{primary}</p>
      {secondary && <p className="mt-0.5 text-[10px] leading-tight text-slate-500">{secondary}</p>}
    </div>
  )
}

export default function TallyBoard() {
  const { user, isAdmin } = useAuth()
  const { toast, toastPhase, showToast, clearToast } = useToast()
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
  const [liveNotice, setLiveNotice] = useState('')
  const dirtyRef = useRef({})
  const rowsRef = useRef({})
  const saveTimer = useRef(null)

  const year = Math.max(Number(period?.year) || 0, new Date().getFullYear())
  const isTargetView = isAdmin && view === 'target'
  const field = isTargetView ? 'target' : 'accomplished'

  const myStaff = useMemo(
    () => people.find((person) => person.user_id === user?.id) || null,
    [people, user?.id],
  )
  const myStaffId = myStaff?.id

  const tablePeople = useMemo(() => people.filter((person) => person.user_id), [people])

  function canEditCell(personId) {
    if (isTargetView) return isAdmin
    return Boolean(myStaffId && personId === myStaffId)
  }

  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  useEffect(() => {
    if (!isAdmin) setView('accomplished')
  }, [isAdmin])

  useEffect(() => {
    loadData({ silent: Boolean(cached) })
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
          applyTallyChange(tally, { notice: 'Updated from a staff save.' })
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
    if (!personId) return
    const key = tallyKey(personId, tally.item_id, tally.semester)
    const keepLocalTarget = isTargetView && Boolean(dirtyRef.current[key])
    const keepLocalAccomplished = !isTargetView && Boolean(dirtyRef.current[key])
    setRows((current) => {
      const existing = current[key] || {
        staff_id: personId,
        user_id: tally.user_id || null,
        item_id: tally.item_id,
        semester: tally.semester,
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
    if (options.notice) {
      setLiveNotice(options.notice)
      window.setTimeout(() => setLiveNotice(''), 2500)
    }
  }

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

      const nextRows = buildBoardRows(context.people, context.items, context.tallies)
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

  const grouped = useMemo(() => {
    const coreItems = orderCoreFunctionItems(items)
    const groups = []
    for (const item of coreItems) {
      const last = groups[groups.length - 1]
      if (last && last.category === item.category) last.items.push(item)
      else groups.push({ category: item.category, items: [item] })
    }
    return groups
  }, [items])

  function updateCell(personId, itemId, semester, value) {
    if (!canEditCell(personId)) return
    const key = tallyKey(personId, itemId, semester)
    const person = people.find((row) => row.id === personId)
    setRows((current) => ({
      ...current,
      [key]: {
        ...(current[key] || {
          staff_id: personId,
          user_id: person?.user_id || user?.id || null,
          item_id: itemId,
          semester,
          target: '',
          accomplished: '',
        }),
        [field]: value,
      },
    }))
    setDirty((current) => ({ ...current, [key]: true }))
    if (!isTargetView) scheduleStaffSave()
  }

  function scheduleStaffSave() {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      saveMine()
    }, 700)
  }

  async function saveMine() {
    if (!period || !myStaffId || !user) return
    const currentRows = rowsRef.current
    const payload = Object.keys(dirtyRef.current)
      .map((key) => currentRows[key])
      .filter((row) => row && row.staff_id === myStaffId)
    if (!payload.length) return

    setSaving(true)
    setError('')
    try {
      await saveStaffTallies(
        supabase,
        period.id,
        myStaffId,
        user.id,
        payload.map((row) => ({
          item_id: row.item_id,
          semester: row.semester,
          accomplished: row.accomplished,
        })),
      )
      const remaining = { ...dirtyRef.current }
      for (const row of payload) {
        delete remaining[tallyKey(row.staff_id, row.item_id, row.semester)]
      }
      setDirty(remaining)
      writeBoardCache({ period, items, people, rows: currentRows })
      showToast('Your accomplishments were saved. Admin can see them now.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function save() {
    if (!period) return
    setSaving(true)
    setError('')
    clearToast()
    try {
      const payload = Object.keys(dirty).map((key) => rows[key]).filter(Boolean)
      if (!payload.length) {
        showToast('No changes to save.')
        setSaving(false)
        return
      }
      await saveAdminTallies(supabase, period.id, payload)
      setDirty({})
      writeBoardCache({ period, items, people, rows })
      showToast('Targets saved.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading && !period) return <LoadingState label="Loading office tally…" />

  const totalColLabel = isTargetView ? 'Total target' : 'Total accomplished'

  return (
    <div className="w-full space-y-5 pb-20">
      <PageHeader
        kicker={period?.office_name}
        title="Office tally sheet"
        description={
          isAdmin
            ? isTargetView
              ? 'Set each person’s targets in the table below. Staff type accomplishments in their own column.'
              : 'Staff type their counts in their column. Green means the target is met; red means it is not yet.'
            : 'Type your accomplishment counts in your column (highlighted). They appear on the admin board automatically.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { id: 'target', label: 'Target' },
                  { id: 'accomplished', label: 'Accomplishments' },
                ]}
              />
            )}
            {liveNotice && (
              <span className="text-xs font-medium text-teal-700">{liveNotice}</span>
            )}
            {saving && !isTargetView && (
              <span className="text-xs font-medium text-slate-500">Saving…</span>
            )}
          </div>
        }
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <Alert tone={isTargetView ? 'warning' : 'info'}>
        {isTargetView ? (
          <>
            Enter <strong>targets</strong> for each person in the columns below, then Save targets.
          </>
        ) : myStaffId ? (
          <>
            Your column is highlighted. Type your counts for January–June and July–December. They
            save automatically. Green means the target is met; red means not yet.
          </>
        ) : (
          <>
            Your login is not linked to a staff account yet. Ask an admin to add you on{' '}
            <strong>Users</strong> so you can type your accomplishments.
          </>
        )}
      </Alert>

      {tablePeople.length === 0 && (
        <Alert tone="warning">
          No staff accounts yet. Create logins in Supabase, then run{' '}
          <strong>supabase/staffs.sql</strong> in the SQL editor — or add staff on Users.
        </Alert>
      )}

      {grouped.map((group) => (
        <section key={group.category} className="card overflow-hidden">
          <div className="border-b border-amber-200 bg-amber-100 px-4 py-2.5">
            <h2 className="text-sm font-bold tracking-wide text-amber-950 uppercase">
              {group.category}
            </h2>
          </div>
          <div className="table-scroll">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-100 text-xs tracking-wide text-slate-600 uppercase">
                  <th
                    className="sticky left-0 z-20 bg-slate-100 px-4 py-2 font-semibold"
                    rowSpan={2}
                  >
                    Core function
                  </th>
                  {tablePeople.length > 0 && (
                    <th
                      colSpan={tablePeople.length}
                      className="border-l border-slate-200 px-2 py-2 text-center font-semibold text-teal-900"
                    >
                      {isTargetView ? 'Staff targets' : 'Staff accomplishments'}
                    </th>
                  )}
                  <th
                    className="min-w-[120px] border-l border-slate-200 bg-teal-50 px-4 py-2 text-center font-semibold text-teal-900"
                    rowSpan={2}
                  >
                    {totalColLabel}
                  </th>
                  {!isTargetView && (
                    <th
                      className="min-w-[140px] border-l border-slate-200 bg-teal-100 px-4 py-2 text-center font-semibold text-teal-950"
                      rowSpan={2}
                    >
                      Total for Jan–Dec {year}
                    </th>
                  )}
                </tr>
                <tr className="bg-slate-50 text-xs text-slate-600">
                  {tablePeople.map((person) => (
                    <th
                      key={person.id}
                      className={`min-w-[100px] border-l border-slate-200 px-2 py-2 text-center align-bottom ${
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
                  const janTarget = rowTotal(tablePeople, item.id, 'jan_june', rows, 'target')
                  const julTarget = rowTotal(tablePeople, item.id, 'july_dec', rows, 'target')
                  const janAccomp = rowTotal(tablePeople, item.id, 'jan_june', rows, 'accomplished')
                  const julAccomp = rowTotal(tablePeople, item.id, 'july_dec', rows, 'accomplished')
                  const janTotal = isTargetView ? janTarget : janAccomp
                  const julTotal = isTargetView ? julTarget : julAccomp
                  const yearAccomp = janAccomp + julAccomp
                  const yearTarget = janTarget + julTarget
                  const yearTone = statusTone(yearAccomp, yearTarget)
                  return SEMESTERS.map((semester, semesterIndex) => {
                    const isJan = semester.id === 'jan_june'
                    const rowBg = isJan ? 'bg-rose-50/70' : 'bg-emerald-50/70'
                    const stickyBg = isJan ? 'bg-rose-50' : 'bg-emerald-50'
                    const total = isJan ? janTotal : julTotal
                    const semesterTarget = isJan ? janTarget : julTarget
                    const semesterAccomp = isJan ? janAccomp : julAccomp
                    const totalTone = isTargetView
                      ? 'neutral'
                      : statusTone(semesterAccomp, semesterTarget)
                    return (
                      <tr key={`${item.id}-${semester.id}`} className={rowBg}>
                        <td className={`sticky left-0 z-10 px-4 py-3 ${stickyBg}`}>
                          <p className="font-semibold text-slate-900">
                            {coreFunctionLabel(item.output)}
                          </p>
                          <p className="mt-0.5 text-xs font-medium text-slate-600">
                            {semesterPeriodLabel(semester.id, year)}
                          </p>
                        </td>
                        {tablePeople.map((person) => {
                          const key = tallyKey(person.id, item.id, semester.id)
                          const row = rows[key]
                          const value = row?.[field] ?? ''
                          const targetValue = row?.target ?? ''
                          const display = formatCount(value)
                          const editable = canEditCell(person.id)
                          const { primary } = personTableHeader(person)
                          const tone = isTargetView
                            ? 'neutral'
                            : statusTone(row?.accomplished, targetValue)
                          const zero = toCount(value) <= 0
                          return (
                            <td
                              key={person.id}
                              className={`border-l border-white/60 px-2 py-2 text-center ${
                                person.id === myStaffId ? 'bg-teal-50/80' : ''
                              }`}
                            >
                              {editable ? (
                                <div>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    value={value}
                                    onChange={(event) =>
                                      updateCell(person.id, item.id, semester.id, event.target.value)
                                    }
                                    className={`field mx-auto w-20 px-2 py-1.5 text-center font-bold ${TONE_TEXT[tone]}`}
                                    placeholder="0"
                                    aria-label={`${primary} ${semester.shortLabel} ${
                                      isTargetView ? 'target' : 'accomplished'
                                    }`}
                                  />
                                  {!isTargetView && toCount(targetValue) > 0 && (
                                    <p className={`mt-1 text-[10px] font-semibold ${TONE_TEXT[tone]}`}>
                                      Target {formatCount(targetValue)}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <div className="rounded-lg bg-white/70 px-2 py-2">
                                  <p
                                    className={`text-base font-bold ${
                                      zero && tone === 'neutral'
                                        ? 'text-slate-400'
                                        : TONE_TEXT[tone]
                                    }`}
                                  >
                                    {display}
                                  </p>
                                  {!isTargetView && toCount(targetValue) > 0 && (
                                    <p className={`mt-0.5 text-[10px] font-semibold ${TONE_TEXT[tone]}`}>
                                      Target {formatCount(targetValue)}
                                    </p>
                                  )}
                                </div>
                              )}
                            </td>
                          )
                        })}
                        <td className="border-l border-slate-200 bg-slate-100/90 px-4 py-3 text-center text-base font-bold">
                          <span className={isTargetView ? 'text-teal-900' : TONE_TEXT[totalTone]}>
                            {formatCount(total)}
                          </span>
                          {!isTargetView && toCount(semesterTarget) > 0 && (
                            <p className={`mt-0.5 text-[10px] font-semibold ${TONE_TEXT[totalTone]}`}>
                              Target {formatCount(semesterTarget)}
                            </p>
                          )}
                        </td>
                        {!isTargetView && semesterIndex === 0 && (
                          <td
                            rowSpan={SEMESTERS.length}
                            className="border-l border-slate-200 bg-teal-50 px-4 py-3 text-center align-middle text-lg font-bold"
                          >
                            <span className={TONE_TEXT[yearTone]}>{formatCount(yearAccomp)}</span>
                            {toCount(yearTarget) > 0 && (
                              <p className={`mt-0.5 text-[10px] font-semibold ${TONE_TEXT[yearTone]}`}>
                                Target {formatCount(yearTarget)}
                              </p>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {isTargetView && (
        <div className="sticky bottom-4 z-10 flex justify-end">
          <Button disabled={saving} onClick={save} className="shadow-lg">
            {saving ? 'Saving…' : 'Save targets'}
          </Button>
        </div>
      )}
      <Toast message={toast} phase={toastPhase} />
    </div>
  )
}
