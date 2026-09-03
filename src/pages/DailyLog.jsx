import { useEffect, useMemo, useRef, useState } from 'react'
import { Save } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'
import { writeAudit } from '../lib/audit'
import { groupItemsBySection, sectionLabel } from '../lib/coreFunctions'
import { formatCount, toCount } from '../lib/opcr'
import {
  formatWorkDate,
  loadDailyContext,
  logsForDate,
  readDailyCache,
  saveDailyLogs,
  todayValue,
  writeDailyCache,
  yearCaption,
  yearTotal,
} from '../lib/daily'
import { Alert, Button, LoadingState, PageHeader, Toast, useToast } from '../components/ui'

export default function DailyLog() {
  const { user } = useAuth()
  const { toast, toastPhase, showToast, clearToast } = useToast()
  const initialCache = useMemo(() => readDailyCache(user?.id), [user?.id])
  const [period, setPeriod] = useState(initialCache?.period || null)
  const [staff, setStaff] = useState(initialCache?.staff || null)
  const [items, setItems] = useState(initialCache?.items || [])
  const [logs, setLogs] = useState(initialCache?.logs || [])
  const [workDate, setWorkDate] = useState(todayValue())
  const [quantities, setQuantities] = useState({})
  const [notes, setNotes] = useState({})
  const [loading, setLoading] = useState(!initialCache)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const userRef = useRef(user)

  useEffect(() => {
    userRef.current = user
  }, [user])

  async function load({ silent = false } = {}) {
    const currentUser = userRef.current
    if (!supabase || !currentUser) {
      setLoading(false)
      return
    }
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
    const nextQty = {}
    const nextNotes = {}
    for (const row of dayLogs) {
      nextQty[row.item_id] = String(toCount(row.quantity) || '')
      nextNotes[row.item_id] = row.notes || ''
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

  async function save() {
    if (!period || !staff || !user) return
    setSaving(true)
    setError('')
    clearToast()
    try {
      const rows = items
        .filter((item) => item.id && !item.pending)
        .map((item) => ({
          item_id: item.id,
          quantity: quantities[item.id],
          notes: notes[item.id],
          log_id: logByItem[item.id]?.id,
          keep: Boolean(logByItem[item.id]),
        }))
      await saveDailyLogs(supabase, {
        periodId: period.id,
        staffId: staff.id,
        userId: user.id,
        workDate,
        rows,
      })
      await load({ silent: true })
      const filled = rows.filter((row) => toCount(row.quantity) > 0).length
      await writeAudit(
        supabase,
        'Saved daily accomplishments',
        'Daily log',
        `${workDate} · ${filled} item${filled === 1 ? '' : 's'}`,
      )
      showToast('Daily counts saved. The tally board is updated.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState label="Loading daily log…" />

  const yearLabel = yearCaption(workDate)
  const dayLabel = formatWorkDate(workDate)

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        kicker={period?.office_name || 'E-Learning Ville'}
        title="Daily accomplishments"
        description="Choose a date, type how many you finished for each core function, then save. Rows follow My OPCR — added or removed lines show here after you save the form."
      />

      <section className="card p-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 flex-wrap items-end gap-x-6 gap-y-3">
            <div className="w-52 shrink-0">
              <label
                htmlFor="daily-work-date"
                className="mb-1.5 block text-xs font-semibold tracking-[0.14em] text-slate-500 uppercase"
              >
                Date
              </label>
              <input
                id="daily-work-date"
                type="date"
                className="field h-11"
                value={workDate}
                onChange={(event) => setWorkDate(event.target.value)}
              />
            </div>
            <div className="min-w-0 pb-1">
              <p className="text-sm font-semibold text-slate-900">{dayLabel}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Counts for this day add to the <strong>{yearLabel}</strong> tally
              </p>
            </div>
          </div>
          <Button className="h-11 min-w-[8.5rem] shrink-0" disabled={saving || !staff} onClick={save}>
            <Save size={16} />
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
        {staff && (
          <ol className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-100 pt-3 text-sm text-slate-600">
            <li>
              <span className="font-bold text-teal-800">1.</span> Pick the date
            </li>
            <li>
              <span className="font-bold text-teal-800">2.</span> Type this day’s count
            </li>
            <li>
              <span className="font-bold text-teal-800">3.</span> Click Save
            </li>
          </ol>
        )}
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

      <div className="function-split-grid">
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
                  <col className="daily-col-note" />
                </colgroup>
                <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Output</th>
                    <th className="px-2 py-2.5 text-center font-semibold">Count</th>
                    <th className="px-2 py-2.5 text-center font-semibold">
                      Total
                      <span className="mt-0.5 block text-[10px] font-medium tracking-normal text-slate-400 normal-case">
                        {yearLabel}
                      </span>
                    </th>
                    <th className="px-3 py-2.5 font-semibold">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item) => {
                    const itemKey = item.id || item.entry_id
                    const total = yearTotal(logs, item.id, workDate)
                    const typed = toCount(quantities[item.id])
                    const shownTotal = total - toCount(logByItem[item.id]?.quantity) + typed
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
                        <td className="px-2 py-2.5 align-middle">
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            disabled={!staff || item.pending}
                            value={item.id ? (quantities[item.id] ?? '') : ''}
                            onChange={(event) => {
                              if (!item.id) return
                              setQuantities((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))
                            }}
                            className="field mx-auto h-10 w-20 px-1 text-center text-base font-bold"
                            placeholder="0"
                            aria-label={`${item.output || 'Output'} count for ${dayLabel}`}
                          />
                        </td>
                        <td className="px-2 py-2.5 align-middle text-center">
                          <span className="text-base font-bold text-teal-800">
                            {formatCount(shownTotal)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <input
                            disabled={!staff || item.pending}
                            value={item.id ? (notes[item.id] ?? '') : ''}
                            onChange={(event) => {
                              if (!item.id) return
                              setNotes((current) => ({ ...current, [item.id]: event.target.value }))
                            }}
                            className="field daily-note-field h-10"
                            placeholder="Note"
                          />
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

      <Toast message={toast} phase={toastPhase} />
    </div>
  )
}
