import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import StatusBadge from '../components/StatusBadge'
import { Alert, Button, LoadingState, PageHeader, Toast, useToast } from '../components/ui'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'
import { writeAudit } from '../lib/audit'
import {
  calcEntryAverage,
  calcFinalAverage,
  formatAverage,
  loadFormBundle,
  saveRatings,
} from '../lib/opcr'

export default function ReviewForm() {
  const { formId } = useParams()
  const { user } = useAuth()
  const { toast, toastPhase, showToast, clearToast } = useToast()
  const [form, setForm] = useState(null)
  const [entries, setEntries] = useState([])
  const [comments, setComments] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isOwnForm = form?.user_id === user?.id
  const average = useMemo(() => calcFinalAverage(entries), [entries])
  const locked = form?.status === 'finalized'

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const bundle = await loadFormBundle(supabase, formId)
        if (!active) return
        setForm(bundle.form)
        setEntries(bundle.entries)
        setComments(bundle.form.comments || '')
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
  }, [formId])

  function updateEntry(id, field, value) {
    setEntries((current) =>
      current.map((entry) => {
        if (entry.id !== id) return entry
        const next = { ...entry, [field]: value }
        next.rating_a = calcEntryAverage(next.rating_q, next.rating_e, next.rating_t)
        return next
      }),
    )
  }

  async function persist(nextStatus) {
    if (!form || isOwnForm) return
    setSaving(true)
    setError('')
    clearToast()
    try {
      await saveRatings(supabase, entries)
      const payload = {
        comments,
        final_average: calcFinalAverage(entries),
      }
      if (nextStatus) {
        payload.status = nextStatus
        if (nextStatus === 'reviewed' || nextStatus === 'finalized') {
          payload.reviewed_at = new Date().toISOString()
        }
      }
      const { data, error: formError } = await supabase
        .from('opcr_forms')
        .update(payload)
        .eq('id', form.id)
        .select('*, profiles(full_name, role, position, office), opcr_periods(year, title, office_name)')
        .single()
      if (formError) throw formError
      setForm(data)
      await writeAudit(
        supabase,
        nextStatus === 'finalized'
          ? 'Finalized OPCR'
          : nextStatus === 'reviewed'
            ? 'Marked OPCR reviewed'
            : 'Saved OPCR ratings',
        'My OPCR',
        data?.profiles?.full_name || '',
      )
      showToast(
        nextStatus === 'finalized'
          ? 'OPCR finalized.'
          : nextStatus === 'reviewed'
            ? 'Marked as reviewed.'
            : 'Ratings saved.',
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState label="Loading form…" />

  return (
    <div className="space-y-5 pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-teal-800">
        <ArrowLeft size={16} />
        Back to tally board
      </Link>

      <PageHeader
        kicker={form?.opcr_periods?.office_name}
        title={form?.profiles?.full_name || 'Staff OPCR'}
        description={`${form?.profiles?.position || 'Staff'} · ${form?.opcr_periods?.year || ''}`}
        actions={
          <div className="text-right">
            {form && <StatusBadge status={form.status} />}
            <p className="mt-2 text-sm text-slate-500">
              Average: <span className="font-semibold text-slate-800">{formatAverage(average)}</span>
            </p>
          </div>
        }
      />

      {isOwnForm && (
        <Alert tone="warning">
          You cannot rate your own OPCR. Use My OPCR to enter accomplishments, and ask another
          admin/head to review this form.
        </Alert>
      )}
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="card overflow-hidden">
        <div className="table-scroll">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-3 font-semibold">Output</th>
                <th className="px-3 py-3 font-semibold">Actual accomplishments</th>
                <th className="px-3 py-3 text-center font-semibold">Q</th>
                <th className="px-3 py-3 text-center font-semibold">E</th>
                <th className="px-3 py-3 text-center font-semibold">T</th>
                <th className="px-3 py-3 text-center font-semibold">A</th>
                <th className="px-3 py-3 font-semibold">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-3">
                    <p className="font-medium text-slate-900">
                      {entry.output || entry.opcr_items?.output}
                    </p>
                    <p className="mt-1 max-w-xs whitespace-pre-wrap text-xs text-slate-500">
                      {entry.success_indicator || entry.opcr_items?.success_indicator}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="max-w-sm whitespace-pre-wrap text-slate-700">
                      {entry.actual_accomplishment || (
                        <span className="text-slate-400">No accomplishment yet</span>
                      )}
                    </p>
                  </td>
                  {['rating_q', 'rating_e', 'rating_t'].map((field) => (
                    <td key={field} className="px-2 py-3">
                      <input
                        type="number"
                        min="1"
                        max="5"
                        step="0.1"
                        disabled={isOwnForm || locked}
                        value={entry[field] ?? ''}
                        onChange={(event) => updateEntry(entry.id, field, event.target.value)}
                        className="field w-16 px-2 py-1.5 text-center"
                        placeholder="1–5"
                      />
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center font-semibold text-slate-800">
                    {formatAverage(entry.rating_a)}
                  </td>
                  <td className="px-3 py-3">
                    <textarea
                      rows={2}
                      disabled={isOwnForm || locked}
                      value={entry.remarks || ''}
                      onChange={(event) => updateEntry(entry.id, 'remarks', event.target.value)}
                      className="field w-44"
                      placeholder="Optional remarks…"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <section className="card p-5">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-800">
            Comments and recommendations
          </span>
          <textarea
            rows={4}
            disabled={isOwnForm || locked}
            value={comments}
            onChange={(event) => setComments(event.target.value)}
            className="field"
            placeholder="Write comments and recommendations for development…"
          />
        </label>
        <p className="mt-3 text-xs text-slate-500">
          Q = Quality · E = Efficiency · T = Timeliness · A = Average (1–5)
        </p>
      </section>

      {!isOwnForm && !locked && (
        <div className="sticky bottom-4 z-10 flex flex-wrap justify-end gap-3">
          <Button variant="secondary" disabled={saving} onClick={() => persist()}>
            Save ratings
          </Button>
          {form?.status !== 'reviewed' && form?.status !== 'finalized' && (
            <Button variant="sky" disabled={saving} onClick={() => persist('reviewed')}>
              Mark reviewed
            </Button>
          )}
          <Button disabled={saving} onClick={() => persist('finalized')} className="shadow-lg">
            Finalize
          </Button>
        </div>
      )}
      <Toast message={toast} phase={toastPhase} />
    </div>
  )
}
