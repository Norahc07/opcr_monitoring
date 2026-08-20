import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatAuditTime } from '../lib/audit'
import { Alert, EmptyState, LoadingState, PageHeader, Segmented } from '../components/ui'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'Login', label: 'Login' },
  { id: 'Daily log', label: 'Daily' },
  { id: 'Tally board', label: 'Tally' },
  { id: 'My OPCR', label: 'OPCR' },
  { id: 'Users', label: 'Users' },
  { id: 'Profile', label: 'Profile' },
]

export default function AuditLogs() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')

  async function load() {
    setError('')
    const { data, error: loadError } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(400)
    if (loadError) {
      if (loadError.code === 'PGRST205' || loadError.message?.includes('audit_logs')) {
        throw new Error(
          'Audit logs are not set up yet. Open Supabase → SQL Editor → run supabase/audit.sql, then refresh this page.',
        )
      }
      throw loadError
    }
    setRows(data || [])
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
  }, [])

  const visible = useMemo(() => {
    if (filter === 'all') return rows
    return rows.filter((row) => row.page === filter)
  }, [filter, rows])

  if (loading) return <LoadingState label="Loading audit logs…" />

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Office"
        title="Audit logs"
        description="Who signed in, saved tallies or OPCR, and changed staff accounts."
        actions={
          <Segmented
            value={filter}
            onChange={setFilter}
            options={FILTERS}
          />
        }
      />

      {error && <Alert tone="danger">{error}</Alert>}

      {!error && visible.length === 0 ? (
        <EmptyState
          title="No audit logs yet"
          body="Activity will appear here after staff and admin use the system. If this is the first time, run supabase/audit.sql in the SQL editor."
        />
      ) : (
        <section className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold">Time</th>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Page</th>
                  <th className="px-4 py-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatAuditTime(row.created_at)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{row.actor_name || 'User'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.actor_role === 'admin' ? 'Admin' : 'Staff'}
                    </td>
                    <td className="px-4 py-3 text-slate-800">{row.action}</td>
                    <td className="px-4 py-3 text-slate-600">{row.page || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{row.details || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
