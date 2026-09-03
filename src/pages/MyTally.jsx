import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'
import { Alert, EmptyState, LoadingState } from '../components/ui'
import {
  annualPeriodLabel,
  buildBoardRows,
  formatCount,
  loadTallyContext,
  personLabel,
  progressPercent,
  readBoardCache,
  readMyTallyCache,
  TALLY_PERIOD_ID,
  tallyKey,
  toCount,
  writeMyTallyCache,
} from '../lib/opcr'
import { groupItemsBySection } from '../lib/coreFunctions'
import { loadDailyContext, todayValue, yearTotal } from '../lib/daily'

const TONE_TEXT = {
  met: 'text-green-600',
  short: 'text-red-600',
  neutral: 'text-slate-900',
}

function statusTone(accomplished, target) {
  const goal = toCount(target)
  if (goal <= 0) return 'neutral'
  return toCount(accomplished) >= goal ? 'met' : 'short'
}

function seedMyTally(userId) {
  const mine = userId ? readMyTallyCache(userId) : null
  if (mine?.items?.length) return mine
  const board = readBoardCache()
  if (!board?.items?.length) return mine
  const me = board.people?.find((person) => person.user_id === userId) || null
  const values = {}
  const targets = {}
  if (me) {
    for (const item of board.items) {
      const key = tallyKey(me.id, item.id, TALLY_PERIOD_ID)
      const row = board.rows?.[key]
      values[key] = row?.accomplished ?? ''
      targets[key] = toCount(row?.target)
    }
  }
  return {
    period: board.period,
    staff: me,
    items: board.items,
    values,
    targets,
  }
}

export default function MyTally() {
  const { user, profile, isAdmin } = useAuth()
  const cached = useMemo(() => seedMyTally(user?.id), [user?.id])
  const [period, setPeriod] = useState(cached?.period || null)
  const [staff, setStaff] = useState(cached?.staff || null)
  const [items, setItems] = useState(cached?.items || [])
  const [values, setValues] = useState(cached?.values || {})
  const [targets, setTargets] = useState(cached?.targets || {})
  const [loading, setLoading] = useState(!cached?.items?.length)
  const [error, setError] = useState('')

  const personId = staff?.id || user?.id

  useEffect(() => {
    let active = true

    async function load({ silent = false } = {}) {
      if (!supabase || !user) {
        setLoading(false)
        return
      }
      if (!silent) setLoading(true)

      try {
        const context = await loadTallyContext(supabase, { includePeople: true })
        if (!active) return
        if (!context.period) {
          setError('No active OPCR period is set. Ask an admin to run the seed SQL.')
          setLoading(false)
          return
        }

        const linked =
          context.staff ||
          context.people.find((person) => person.user_id === user.id) ||
          null
        const id = linked?.id || user.id
        let dailyLogs = []
        try {
          const daily = await loadDailyContext(supabase, user.id)
          dailyLogs = daily.logs || []
        } catch {
          dailyLogs = []
        }
        if (!active) return
        const boardRows = buildBoardRows(
          linked ? [linked] : [],
          context.items,
          context.tallies,
          context.personItemByOutput,
        )
        const workDate = todayValue()
        const nextValues = {}
        const nextTargets = {}
        for (const item of context.items) {
          const key = tallyKey(id, item.id, TALLY_PERIOD_ID)
          const row = boardRows[key]
          const personItemId = row?.item_id || item.id
          const fromDaily = Math.max(
            yearTotal(dailyLogs, item.id, workDate),
            personItemId !== item.id ? yearTotal(dailyLogs, personItemId, workDate) : 0,
          )
          const accomplished = Math.max(toCount(row?.accomplished), fromDaily)
          nextValues[key] = accomplished ? String(accomplished) : ''
          nextTargets[key] = toCount(row?.target)
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
        if (active && !silent) setLoading(false)
      }
    }

    load()
    const poll = window.setInterval(() => {
      load({ silent: true })
    }, 12000)
    return () => {
      active = false
      window.clearInterval(poll)
    }
  }, [user, isAdmin])

  const grouped = useMemo(() => groupItemsBySection(items), [items])

  const summary = useMemo(() => {
    let filled = 0
    let assigned = 0
    for (const item of items) {
      const key = personId ? tallyKey(personId, item.id, TALLY_PERIOD_ID) : ''
      if (toCount(targets[key]) > 0) assigned += 1
      if (toCount(values[key]) > 0) filled += 1
    }
    return { filled, assigned }
  }, [items, personId, targets, values])

  const year = Math.max(Number(period?.year) || 0, new Date().getFullYear())

  if (loading && !period) return <LoadingState label="Loading your tally…" />

  return (
    <div className="my-tally w-full space-y-4 pb-8">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.18em] text-teal-700 uppercase">
            Tally per person
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            {personLabel(staff || profile)}
          </h1>
          <p className="mt-1.5 overflow-hidden text-sm leading-6 text-ellipsis whitespace-nowrap text-slate-500">
            {`Your assigned targets and year totals for ${annualPeriodLabel(year)}.${staff?.position ? ` ${staff.position}.` : ''} Add work on Daily log; this page is view only.`}
          </p>
        </div>
        <div className="flex shrink-0 items-stretch gap-3">
          <div className="card flex w-36 flex-col justify-center px-4 py-2.5">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Filled</p>
            <p className="mt-0.5 text-2xl font-semibold">{summary.filled}</p>
          </div>
          <div className="card flex w-44 flex-col justify-center px-4 py-2.5">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Assigned targets</p>
            <p className="mt-0.5 text-2xl font-semibold">{summary.assigned}</p>
          </div>
        </div>
      </div>

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

      <div className="function-split-grid">
        {grouped.map((group) => (
          <section key={group.category} className="card overflow-hidden">
          <div className="border-b border-amber-200 bg-amber-100 px-4 py-2.5">
            <h2 className="text-sm font-bold tracking-wide text-amber-950 uppercase">
              {group.category}
            </h2>
          </div>
          <div className="table-scroll">
            <table className="tally-table w-full text-left text-sm">
              <colgroup>
                <col className="tally-col-output" />
                <col className="tally-col-target" />
                <col className="tally-col-done" />
                <col className="tally-col-progress" />
              </colgroup>
              <thead>
                <tr className="bg-slate-100 text-[11px] text-slate-600 uppercase">
                  <th className="px-3 py-2 font-semibold">Output</th>
                  <th className="border-l border-slate-200 px-1.5 py-2 text-center font-semibold">
                    Target
                  </th>
                  <th className="border-l border-slate-200 bg-teal-50 px-1.5 py-2 text-center font-semibold text-teal-900">
                    Actual
                  </th>
                  <th className="border-l border-slate-200 px-1.5 py-2 text-center font-semibold">
                    %
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item) => {
                  const key = personId ? tallyKey(personId, item.id, TALLY_PERIOD_ID) : item.id
                  const target = targets[key] || 0
                  const accomplished = values[key] ?? ''
                  const percent = progressPercent(accomplished, target)
                  const tone = statusTone(accomplished, target)
                  const zero = toCount(accomplished) <= 0
                  return (
                    <tr key={item.id} className="border-t border-slate-100 bg-white">
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-slate-900">{item.output}</p>
                      </td>
                      <td className="border-l border-slate-100 px-1.5 py-2.5 text-center text-base font-bold text-slate-700">
                        {formatCount(target)}
                      </td>
                      <td className="border-l border-slate-100 bg-teal-50/80 px-1.5 py-2.5 text-center">
                        <p
                          className={`text-base font-bold ${
                            zero && tone === 'neutral' ? 'text-slate-400' : TONE_TEXT[tone]
                          }`}
                        >
                          {formatCount(accomplished)}
                        </p>
                      </td>
                      <td className={`border-l border-slate-100 px-1.5 py-2.5 text-center text-sm font-semibold ${TONE_TEXT[tone]}`}>
                        {percent == null ? '—' : `${percent}%`}
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

      {items.length === 0 && (
        <EmptyState
          title="No outputs yet"
          body="Open My OPCR and save the office form so outputs appear here, or ask an admin to set the office OPCR."
        />
      )}
    </div>
  )
}
