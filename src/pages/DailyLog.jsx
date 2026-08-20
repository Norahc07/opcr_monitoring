import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'
import { writeAudit } from '../lib/audit'
import { coreFunctionLabel } from '../lib/coreFunctions'
import { formatCount, toCount } from '../lib/opcr'
import {
  formatWorkDate,
  groupDailyHistory,
  loadDailyContext,
  logsForDate,
  saveDailyLogs,
  semesterCaption,
  semesterTotal,
  todayValue,
} from '../lib/daily'
import { Alert, Button, LoadingState, PageHeader, Toast, useToast } from '../components/ui'

export default function DailyLog() {
  const { user } = useAuth()
  const { toast, toastPhase, showToast, clearToast } = useToast()
  const [period, setPeriod] = useState(null)
  const [staff, setStaff] = useState(null)
  const [items, setItems] = useState([])
  const [logs, setLogs] = useState([])
  const [workDate, setWorkDate] = useState(todayValue())
  const [quantities, setQuantities] = useState({})
  const [notes, setNotes] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    if (!supabase || !user) {
      setLoading(false)
      return
    }
    setError('')
    const context = await loadDailyContext(supabase, user.id)
    setPeriod(context.period)
    setStaff(context.staff)
    setItems(context.items)
    setLogs(context.logs)
    if (!context.period) {
      setError('No active OPCR period is set. Ask an admin to run the seed SQL.')
    }
  }

  useEffect(() => {
    let active = true
    async function start() {
      try {
        await load()
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    start()
    return () => {
      active = false
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

  const grouped = useMemo(() => {
    const groups = []
    for (const item of items) {
      const last = groups[groups.length - 1]
      if (last && last.category === item.category) last.items.push(item)
      else groups.push({ category: item.category, items: [item] })
    }
    return groups
  }, [items])

  const history = useMemo(() => groupDailyHistory(logs, items).slice(0, 14), [logs, items])
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
      const rows = items.map((item) => ({
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
      await load()
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

  const semester = semesterCaption(workDate)
  const dayLabel = formatWorkDate(workDate)

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        kicker={period?.office_name || 'E-Learning Ville'}
        title="Daily accomplishments"
        description="Choose a date, type how many you finished for each core function, then save. The tally board keeps a running total for the semester."
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
                Counts for this day add to the <strong>{semester}</strong> tally
              </p>
            </div>
          </div>
          <Button className="h-11 min-w-[8.5rem] shrink-0" disabled={saving || !staff} onClick={save}>
            {saving ? 'Saving…' : 'Save day'}
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
              <span className="font-bold text-teal-800">3.</span> Click Save day
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

      {grouped.map((group) => (
        <section key={group.category} className="card overflow-hidden">
          <div className="border-b border-amber-200 bg-amber-100 px-5 py-2.5">
            <h2 className="text-sm font-bold tracking-wide text-amber-950 uppercase">
              {group.category}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-3 font-semibold">Core function</th>
                  <th className="w-44 px-5 py-3 text-center font-semibold">This day’s count</th>
                  <th className="w-44 px-5 py-3 text-center font-semibold">
                    Running total
                    <span className="mt-0.5 block text-[10px] font-medium tracking-normal text-slate-400 normal-case">
                      {semester}
                    </span>
                  </th>
                  <th className="px-5 py-3 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item) => {
                  const total = semesterTotal(logs, item.id, workDate)
                  const typed = toCount(quantities[item.id])
                  const shownTotal = total - toCount(logByItem[item.id]?.quantity) + typed
                  return (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-5 py-3 align-middle font-semibold text-slate-900">
                        {coreFunctionLabel(item.output)}
                      </td>
                      <td className="px-5 py-3 align-middle">
                        <div className="mx-auto w-28">
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            disabled={!staff}
                            value={quantities[item.id] ?? ''}
                            onChange={(event) =>
                              setQuantities((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))
                            }
                            className="field h-11 px-2 text-center text-base font-bold"
                            placeholder="0"
                            aria-label={`${coreFunctionLabel(item.output)} count for ${dayLabel}`}
                          />
                        </div>
                      </td>
                      <td className="px-5 py-3 align-middle text-center">
                        <span className="text-lg font-bold text-teal-800">
                          {formatCount(shownTotal)}
                        </span>
                      </td>
                      <td className="px-5 py-3 align-middle">
                        <input
                          disabled={!staff}
                          value={notes[item.id] ?? ''}
                          onChange={(event) =>
                            setNotes((current) => ({ ...current, [item.id]: event.target.value }))
                          }
                          className="field h-11"
                          placeholder="Optional note"
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

      <section className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-900">Recent days</h2>
          <p className="mt-0.5 text-xs text-slate-500">Click a day to open it and edit the counts.</p>
        </div>
        {history.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">
            Nothing saved yet. Enter counts above and click Save day.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {history.map((day) => (
              <button
                key={day.date}
                type="button"
                onClick={() => setWorkDate(day.date)}
                className={`flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left hover:bg-slate-50 ${
                  day.date === workDate ? 'bg-teal-50' : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{formatWorkDate(day.date)}</p>
                  <p className="mt-1 truncate text-sm text-slate-600">
                    {day.rows.map((row) => `${row.label} ${row.display}`).join(' · ') || 'No counts'}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-bold text-teal-800">
                  {formatCount(day.total)}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>

      {staff && (
        <div className="sticky bottom-4 z-10 flex justify-end">
          <Button disabled={saving} onClick={save} className="h-11 min-w-[8.5rem] shadow-lg">
            {saving ? 'Saving…' : 'Save day'}
          </Button>
        </div>
      )}
      <Toast message={toast} phase={toastPhase} />
    </div>
  )
}
