import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'
import { Alert, Button, EmptyState, LoadingState, PageHeader, ProgressBar, Toast, useToast } from '../components/ui'
import {
  formatCount,
  loadTallyContext,
  personLabel,
  progressPercent,
  readMyTallyCache,
  saveStaffTallies,
  SEMESTERS,
  tallyKey,
  toCount,
  writeMyTallyCache,
} from '../lib/opcr'
import { coreFunctionLabel, orderCoreFunctionItems } from '../lib/coreFunctions'

export default function MyTally() {
  const { user, profile, isAdmin } = useAuth()
  const { toast, toastPhase, showToast, clearToast } = useToast()
  const cached = useMemo(() => (user?.id ? readMyTallyCache(user.id) : null), [user?.id])
  const [period, setPeriod] = useState(cached?.period || null)
  const [staff, setStaff] = useState(cached?.staff || null)
  const [items, setItems] = useState(cached?.items || [])
  const [values, setValues] = useState(cached?.values || {})
  const [targets, setTargets] = useState(cached?.targets || {})
  const [assignedOnly, setAssignedOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(!cached)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const personId = staff?.id || user?.id

  useEffect(() => {
    let active = true

    async function load() {
      if (!supabase || !user) {
        setLoading(false)
        return
      }

      try {
        const context = await loadTallyContext(supabase, { userId: user.id })
        if (!active) return
        if (!context.period) {
          setError('No active OPCR period is set. Ask an admin to run the seed SQL.')
          setLoading(false)
          return
        }

        const linked = context.staff
        const id = linked?.id || user.id
        const nextValues = {}
        const nextTargets = {}
        for (const item of context.items) {
          for (const semester of SEMESTERS) {
            const row = context.tallies.find(
              (tally) => tally.item_id === item.id && tally.semester === semester.id,
            )
            const key = tallyKey(id, item.id, semester.id)
            nextValues[key] = row ? String(toCount(row.accomplished)) : ''
            nextTargets[key] = toCount(row?.target)
          }
        }

        setPeriod(context.period)
        setStaff(linked)
        setItems(context.items)
        setValues(nextValues)
        setTargets(nextTargets)
        writeMyTallyCache({
          userId: user.id,
          period: context.period,
          staff: linked,
          items: context.items,
          values: nextValues,
          targets: nextTargets,
        })
        if (!linked) {
          setError(
            isAdmin
              ? 'Your login is not on Staffs yet. Run supabase/staffs.sql in the SQL editor, or add your account on Users.'
              : 'Your login is not on Staffs yet. Ask an admin to add your account on Users so your counts appear on the tally board.',
          )
        }
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [user, isAdmin])

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return orderCoreFunctionItems(items).filter((item) => {
      const assigned =
        !assignedOnly || SEMESTERS.some((semester) => targets[tallyKey(personId, item.id, semester.id)] > 0)
      const label = coreFunctionLabel(item.output).toLowerCase()
      const matches =
        !needle ||
        item.output.toLowerCase().includes(needle) ||
        label.includes(needle) ||
        item.success_indicator.toLowerCase().includes(needle)
      return assigned && matches
    })
  }, [assignedOnly, items, personId, query, targets])

  const grouped = useMemo(() => {
    const groups = []
    for (const item of visibleItems) {
      const last = groups[groups.length - 1]
      if (last && last.category === item.category) last.items.push(item)
      else groups.push({ category: item.category, items: [item] })
    }
    return groups
  }, [visibleItems])

  const summary = useMemo(() => {
    let filled = 0
    let assigned = 0
    for (const item of items) {
      for (const semester of SEMESTERS) {
        const key = personId ? tallyKey(personId, item.id, semester.id) : ''
        if (targets[key] > 0) assigned += 1
        if (toCount(values[key]) > 0) filled += 1
      }
    }
    return { filled, assigned, total: items.length * 2 }
  }, [items, personId, targets, values])

  async function save() {
    if (!period || !user || !staff?.id) return
    setSaving(true)
    setError('')
    clearToast()
    try {
      const rows = items.flatMap((item) =>
        SEMESTERS.map((semester) => ({
          item_id: item.id,
          semester: semester.id,
          accomplished: values[tallyKey(staff.id, item.id, semester.id)],
        })),
      )
      await saveStaffTallies(supabase, period.id, staff.id, user.id, rows)
      writeMyTallyCache({
        userId: user.id,
        period,
        staff,
        items,
        values,
        targets,
      })
      showToast('Your tally was saved.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading && !period) return <LoadingState label="Loading your tally…" />

  return (
    <div className="w-full space-y-5 pb-20">
      <PageHeader
        kicker="Tally per person"
        title={personLabel(staff || profile)}
        description={`Enter your personal accomplished counts for ${period?.year || 'this year'}. ${staff?.position ? `${staff.position}. ` : ''}Only you can edit this page. Your head/admin sets targets and views office totals on Tally board.`}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card px-4 py-4">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Filled</p>
          <p className="mt-1 text-2xl font-semibold">{summary.filled}</p>
        </div>
        <div className="card px-4 py-4">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Assigned targets</p>
          <p className="mt-1 text-2xl font-semibold">{summary.assigned}</p>
        </div>
        <div className="card px-4 py-4">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Semester slots</p>
          <p className="mt-1 text-2xl font-semibold">{summary.total}</p>
        </div>
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-60 flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by output or success indicator…"
            className="field field-with-icon"
          />
        </div>
        <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={assignedOnly}
            onChange={(event) => setAssignedOnly(event.target.checked)}
          />
          Assigned to me only
        </label>
      </div>

      <Alert>
        This is your personal tally. Type your accomplished counts for each task. Your admin sees
        these on Tally board under Accomplishments.
      </Alert>

      {error && (
        <Alert tone="danger">
          {error}
          {isAdmin && !staff?.id && (
            <p className="mt-2">
              <Link to="/users" className="font-semibold underline">
                Open Users to link your account
              </Link>
            </p>
          )}
        </Alert>
      )}

      {grouped.map((group) => (
        <section key={group.category} className="space-y-3">
          <h2 className="px-1 text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase">
            {group.category}
          </h2>
          {group.items.map((item) => (
            <article key={item.id} className="card p-5">
              <h3 className="text-lg font-semibold tracking-tight text-slate-900">
                {coreFunctionLabel(item.output)}
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">{item.success_indicator}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {SEMESTERS.map((semester) => {
                  const key = personId ? tallyKey(personId, item.id, semester.id) : semester.id
                  const target = targets[key] || 0
                  const accomplished = values[key] ?? ''
                  const percent = progressPercent(accomplished, target)
                  return (
                    <div
                      key={semester.id}
                      className={`rounded-2xl border p-4 ${
                        semester.id === 'jan_june'
                          ? 'border-emerald-100 bg-emerald-50/80'
                          : 'border-rose-100 bg-rose-50/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold tracking-wide text-slate-600 uppercase">
                          {semester.label}
                        </p>
                        <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          Target {formatCount(target)}
                        </span>
                      </div>
                      <label className="mt-3 block">
                        <span className="mb-1 block text-xs font-medium text-slate-600">Accomplished</span>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={accomplished}
                          onChange={(event) =>
                            setValues((current) => ({ ...current, [key]: event.target.value }))
                          }
                          className="field text-lg font-semibold"
                          placeholder="Enter count, e.g. 12"
                        />
                      </label>
                      {percent != null && (
                        <div className="mt-3 space-y-1.5">
                          <ProgressBar percent={percent} />
                          <p className={`text-xs font-medium ${percent >= 100 ? 'text-teal-800' : 'text-slate-600'}`}>
                            {formatCount(accomplished || 0)} / {formatCount(target)} · {percent}%
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </article>
          ))}
        </section>
      ))}

      {visibleItems.length === 0 && (
        <EmptyState
          title="Nothing to show"
          body="Ask the head/admin to set your targets, clear the search, or turn off “Assigned to me only”."
        />
      )}

      <div className="sticky bottom-4 z-10 flex justify-end">
        <Button disabled={saving || !items.length || !staff?.id} onClick={save} className="shadow-lg">
          {saving ? 'Saving…' : 'Save my tally'}
        </Button>
      </div>
      <Toast message={toast} phase={toastPhase} />
    </div>
  )
}
