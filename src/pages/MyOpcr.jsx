import { useEffect, useMemo, useState } from 'react'
import { Pencil, Printer } from 'lucide-react'
import { Alert, Button, LoadingState, Toast, useToast } from '../components/ui'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'
import { writeAudit } from '../lib/audit'
import {
  calcFinalAverage,
  ensureUserForm,
  formatAverage,
  formatDateDisplay,
  getActivePeriod,
  readApprovedCache,
  readClosingCache,
  saveEntries,
  saveFormSigner,
  toDateValue,
  writeApprovedCache,
  writeClosingCache,
} from '../lib/opcr'
import { SECTION1, SECTION2, SECTION3, SECTION4 } from '../lib/coreFunctions'

const HEAD_OF_OFFICE = 'HON. BAUTISTA ERWIN DWIGHT C. PASTRANA'
const HEAD_OF_OFFICE_TITLE = 'Municipal Mayor'
const ASSESSOR_NAME = 'CONCHITA MARTA B. MIRABUENO'
const ASSESSOR_TITLE = 'MGDH1-Center Manager'

function matchEntry(entries, spec) {
  const exact = entries.find((row) => {
    const name = String(row.opcr_items?.output || '')
      .trim()
      .toLowerCase()
    return spec.keys.some((key) => name === key)
  })
  if (exact) return exact
  return entries.find((row) => {
    const name = String(row.opcr_items?.output || '')
      .trim()
      .toLowerCase()
    return spec.keys.some((key) => name.includes(key))
  })
}

function matchSection(specs, entries) {
  return specs.map((spec) => ({ spec, entry: matchEntry(entries, spec) }))
}

function OpcrColGroup() {
  return (
    <colgroup>
      <col className="opcr-col-output" />
      <col className="opcr-col-success" />
      <col className="opcr-col-actual" />
      <col className="opcr-col-rating" />
      <col className="opcr-col-rating" />
      <col className="opcr-col-rating" />
      <col className="opcr-col-rating" />
      <col className="opcr-col-remarks" />
    </colgroup>
  )
}

function OpcrColumnHeads({ className = '' }) {
  return (
    <thead className={className}>
      <tr>
        <th rowSpan={2}>Output</th>
        <th rowSpan={2}>
          Success Indicator
          <span className="mt-0.5 block text-[10px] font-medium tracking-normal normal-case">
            (Target + Measures)
          </span>
        </th>
        <th rowSpan={2}>Actual Accomplishments</th>
        <th colSpan={4}>Rating</th>
        <th rowSpan={2}>Remarks</th>
      </tr>
      <tr className="opcr-subhead">
        <th>Q¹</th>
        <th>E²</th>
        <th>T³</th>
        <th>A⁴</th>
      </tr>
    </thead>
  )
}

function OpcrFunctionsTable({ headClassName = '', children }) {
  return (
    <table className="opcr-functions">
      <OpcrColGroup />
      <OpcrColumnHeads className={headClassName} />
      <tbody>{children}</tbody>
    </table>
  )
}

function successLines(spec) {
  return Array.isArray(spec.success) ? spec.success : [spec.success]
}

function OpcrItemRows({ rows, locked, editing, onUpdate }) {
  return rows.flatMap(({ spec, entry }) => {
    const lines = successLines(spec)
    const span = lines.length

    const accomplishmentCell = (
      <td rowSpan={span}>
        {editing && !locked ? (
          <textarea
            disabled={!entry}
            value={entry?.actual_accomplishment || ''}
            onChange={(event) => onUpdate(entry?.id, 'actual_accomplishment', event.target.value)}
            className="field"
            placeholder="Enter actual accomplishment"
          />
        ) : (
          <p className="min-h-16 whitespace-pre-wrap">{entry?.actual_accomplishment || ''}</p>
        )}
      </td>
    )

    const ratingCells = [
      ['Q', entry?.rating_q],
      ['E', entry?.rating_e],
      ['T', entry?.rating_t],
      ['A', entry?.rating_a],
    ].map(([label, value]) => (
      <td
        key={label}
        rowSpan={span}
        className="text-center align-middle font-semibold text-slate-500"
      >
        {value ? formatAverage(value) : ''}
      </td>
    ))

    const remarksCell = (
      <td rowSpan={span}>
        {editing && !locked ? (
          <textarea
            disabled={!entry}
            value={entry?.remarks || ''}
            onChange={(event) => onUpdate(entry?.id, 'remarks', event.target.value)}
            className="field"
            placeholder="Remarks"
          />
        ) : (
          <p className="min-h-16 whitespace-pre-wrap">{entry?.remarks || ''}</p>
        )}
      </td>
    )

    return lines.map((line, lineIndex) => (
      <tr key={`${spec.output}-${lineIndex}`}>
        {lineIndex === 0 && (
          <td rowSpan={span} className="align-middle font-bold text-slate-900">
            {spec.output}
          </td>
        )}
        <td className="leading-6 text-slate-700">{line}</td>
        {lineIndex === 0 && (
          <>
            {accomplishmentCell}
            {ratingCells}
            {remarksCell}
          </>
        )}
      </tr>
    ))
  })
}

function ClosingDate({ editing, locked, value, onChange }) {
  const saved = toDateValue(value)
  if (editing && !locked) {
    return (
      <input
        type="date"
        value={saved}
        onChange={(event) => onChange(toDateValue(event.target.value))}
      />
    )
  }
  return <span className="opcr-closing-date-text">{formatDateDisplay(saved)}</span>
}

export default function MyOpcr() {
  const { user, profile } = useAuth()
  const { toast, toastPhase, toastTone, showToast } = useToast()
  const [period, setPeriod] = useState(null)
  const [form, setForm] = useState(null)
  const [entries, setEntries] = useState([])
  const [approvedName, setApprovedName] = useState(HEAD_OF_OFFICE)
  const [approvedPosition, setApprovedPosition] = useState(HEAD_OF_OFFICE_TITLE)
  const [approvedDate, setApprovedDate] = useState('')
  const [staffName, setStaffName] = useState('')
  const [staffPosition, setStaffPosition] = useState('')
  const [comments, setComments] = useState('')
  const [assessedName, setAssessedName] = useState(ASSESSOR_NAME)
  const [assessedPosition, setAssessedPosition] = useState(ASSESSOR_TITLE)
  const [discussedDate, setDiscussedDate] = useState('')
  const [assessedDate, setAssessedDate] = useState('')
  const [finalRaterName, setFinalRaterName] = useState('')
  const [finalRatingDate, setFinalRatingDate] = useState('')
  const [editingIdentity, setEditingIdentity] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const locked = form?.status === 'reviewed' || form?.status === 'finalized'
  const year = Math.max(Number(period?.year) || 0, new Date().getFullYear())
  const average = useMemo(() => calcFinalAverage(entries), [entries])

  const section1Entries = useMemo(() => matchSection(SECTION1, entries), [entries])
  const section2Entries = useMemo(() => matchSection(SECTION2, entries), [entries])
  const section3Entries = useMemo(() => matchSection(SECTION3, entries), [entries])
  const section4Entries = useMemo(() => matchSection(SECTION4, entries), [entries])

  useEffect(() => {
    let active = true

    async function load() {
      if (!supabase || !user) {
        setLoading(false)
        return
      }

      try {
        const activePeriod = await getActivePeriod(supabase)
        if (!activePeriod) {
          if (active) {
            setError('No active OPCR period is set. Ask an admin to run the seed SQL.')
            setLoading(false)
          }
          return
        }

        const bundle = await ensureUserForm(supabase, user.id, activePeriod.id)
        if (!active) return
        const cached = readApprovedCache(bundle.form?.id)
        const closing = readClosingCache(bundle.form?.id)
        setPeriod(activePeriod)
        setForm(bundle.form)
        setEntries(bundle.entries || [])
        setStaffName(bundle.form?.signer_name?.trim() || profile?.full_name || '')
        setStaffPosition(bundle.form?.signer_position?.trim() || profile?.position || '')
        setApprovedName(
          bundle.form?.approved_name?.trim() || cached?.name || HEAD_OF_OFFICE,
        )
        setApprovedPosition(
          bundle.form?.approved_position?.trim() || cached?.position || HEAD_OF_OFFICE_TITLE,
        )
        setApprovedDate(toDateValue(bundle.form?.approved_date) || toDateValue(cached?.date))
        setComments(bundle.form?.comments || closing?.comments || '')
        setAssessedName(bundle.form?.assessed_name?.trim() || closing?.assessedName || ASSESSOR_NAME)
        setAssessedPosition(
          bundle.form?.assessed_position?.trim() || closing?.assessedPosition || ASSESSOR_TITLE,
        )
        setDiscussedDate(
          toDateValue(bundle.form?.discussed_date) || toDateValue(closing?.discussedDate),
        )
        setAssessedDate(
          toDateValue(bundle.form?.assessed_date) || toDateValue(closing?.assessedDate),
        )
        setFinalRaterName(bundle.form?.final_rater_name || closing?.finalRaterName || '')
        setFinalRatingDate(
          toDateValue(bundle.form?.final_rating_date) || toDateValue(closing?.finalRatingDate),
        )
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
  }, [user?.id])

  async function changeApprovedDate(value) {
    const nextDate = toDateValue(value)
    setApprovedDate(nextDate)
    if (!form?.id) return
    writeApprovedCache(form.id, {
      name: approvedName,
      position: approvedPosition,
      date: nextDate,
    })
    await supabase
      .from('opcr_forms')
      .update({ approved_date: nextDate || null })
      .eq('id', form.id)
  }

  function updateEntry(id, field, value) {
    if (!id) return
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry)),
    )
  }

  async function persist() {
    if (!form) return
    setSaving(true)
    setError('')
    try {
      const sectionIds = new Set(
        [...section1Entries, ...section2Entries, ...section3Entries, ...section4Entries].map((row) => row.entry?.id).filter(Boolean),
      )
      await saveEntries(
        supabase,
        entries.filter((entry) => sectionIds.has(entry.id)),
      )
      const savedDate = await saveFormSigner(supabase, form.id, {
        name: staffName.trim(),
        position: staffPosition.trim(),
        approvedName: approvedName.trim(),
        approvedPosition: approvedPosition.trim(),
        approvedDate,
        comments: comments.trim(),
        assessedName: assessedName.trim(),
        assessedPosition: assessedPosition.trim(),
        discussedDate,
        assessedDate,
        finalRaterName: finalRaterName.trim(),
        finalRatingDate,
      })
      const nextDate = savedDate || toDateValue(approvedDate)
      const nextDiscussed = toDateValue(discussedDate)
      const nextAssessedOn = toDateValue(assessedDate)
      const nextFinalOn = toDateValue(finalRatingDate)
      setApprovedDate(nextDate)
      setDiscussedDate(nextDiscussed)
      setAssessedDate(nextAssessedOn)
      setFinalRatingDate(nextFinalOn)
      writeApprovedCache(form.id, {
        name: approvedName.trim(),
        position: approvedPosition.trim(),
        date: nextDate,
      })
      writeClosingCache(form.id, {
        comments: comments.trim(),
        assessedName: assessedName.trim(),
        assessedPosition: assessedPosition.trim(),
        discussedDate: nextDiscussed,
        assessedDate: nextAssessedOn,
        finalRaterName: finalRaterName.trim(),
        finalRatingDate: nextFinalOn,
      })
      setForm((current) =>
        current
          ? {
              ...current,
              signer_name: staffName.trim(),
              signer_position: staffPosition.trim(),
              approved_name: approvedName.trim(),
              approved_position: approvedPosition.trim(),
              approved_date: nextDate || null,
              comments: comments.trim(),
              assessed_name: assessedName.trim(),
              assessed_position: assessedPosition.trim(),
              discussed_date: nextDiscussed || null,
              assessed_date: nextAssessedOn || null,
              final_rater_name: finalRaterName.trim(),
              final_rating_date: nextFinalOn || null,
            }
          : current,
      )
      setEditingIdentity(false)
      await writeAudit(
        supabase,
        'Saved OPCR',
        'My OPCR',
        period?.title || String(period?.year || year || ''),
      )
      showToast('OPCR saved.')
    } catch (err) {
      setError(err.message)
      showToast(err.message || 'Could not save OPCR.', 'danger')
    } finally {
      setSaving(false)
    }
  }

  function printOpcr() {
    document.body.classList.add('printing-opcr')
    const done = () => document.body.classList.remove('printing-opcr')
    window.addEventListener('afterprint', done, { once: true })
    window.setTimeout(() => window.print(), 50)
  }

  if (loading) return <LoadingState label="Loading your OPCR…" />

  return (
    <div className="w-full space-y-4 pb-20 print:space-y-0 print:pb-0">
      {error && (
        <div className="print-hide">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <article className="card relative overflow-hidden p-5 sm:p-7 print:overflow-visible">
        <div className="absolute top-5 right-5 z-10 flex gap-2 sm:top-7 sm:right-7 print-hide">
          <Button variant="secondary" onClick={printOpcr}>
            <Printer size={16} />
            Print
          </Button>
          {!locked &&
            (editingIdentity ? (
              <Button disabled={saving} onClick={persist}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setEditingIdentity(true)}>
                <Pencil size={16} />
                Edit
              </Button>
            ))}
        </div>

        <div className="opcr-sheet mt-0">
          <div className="opcr-print-page">
            <header className="opcr-print-header space-y-5">
              <h1 className="px-20 text-center text-xl font-bold tracking-wide text-slate-900 uppercase sm:px-28 sm:text-2xl">
                Office Performance Commitment and Review (OPCR)
              </h1>
              <p className="text-center text-sm leading-6 text-slate-600">
                <span className="block">
                  Office of the <strong>Municipal Mayor (Mauban eLearningVille)</strong> of the{' '}
                  <strong>Local Government Unit of Mauban, Quezon</strong>
                </span>
                <span className="block">
                  commit to deliver and agree to be rated on the attainment of the following targets in
                  accordance with the indicated measures for the period of{' '}
                  <strong>January to December {year}</strong>.
                </span>
              </p>
              {editingIdentity && !locked ? (
                <div className="opcr-signer">
                  <input
                    className="opcr-signer-name"
                    value={staffName}
                    onChange={(event) => setStaffName(event.target.value)}
                    placeholder="Name"
                  />
                  <input
                    className="opcr-signer-position"
                    value={staffPosition}
                    onChange={(event) => setStaffPosition(event.target.value)}
                    placeholder="Position"
                  />
                </div>
              ) : (
                <div className="opcr-signer">
                  <p className="opcr-signer-name">
                    {staffName || <span className="opcr-signer-placeholder">Name</span>}
                  </p>
                  <p className="opcr-signer-position">
                    {staffPosition || <span className="opcr-signer-placeholder">Position</span>}
                  </p>
                </div>
              )}
            </header>

            <table className="opcr-approved mt-6">
              <colgroup>
                <col style={{ width: '42%' }} />
                <col style={{ width: '2%' }} />
                <col style={{ width: '41%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <tbody>
                <tr>
                  <td colSpan={3} className="opcr-approved-label">
                    Approved by:
                  </td>
                  <td className="opcr-approved-label">Date</td>
                </tr>
                <tr>
                  <td colSpan={3} className="opcr-approved-sign">
                    {editingIdentity && !locked ? (
                      <div className="space-y-1">
                        <input
                          className="opcr-approved-name"
                          value={approvedName}
                          onChange={(event) => setApprovedName(event.target.value)}
                          placeholder="Name"
                        />
                        <input
                          className="opcr-approved-position"
                          value={approvedPosition}
                          onChange={(event) => setApprovedPosition(event.target.value)}
                          placeholder="Position"
                        />
                      </div>
                    ) : (
                      <>
                        <p className="opcr-approved-name">{approvedName}</p>
                        {approvedPosition ? (
                          <p className="opcr-approved-position">{approvedPosition}</p>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className="opcr-approved-date">
                    {editingIdentity && !locked ? (
                      <input
                        type="date"
                        value={toDateValue(approvedDate)}
                        onChange={(event) => changeApprovedDate(event.target.value)}
                      />
                    ) : (
                      <span className="opcr-approved-date-value">
                        {formatDateDisplay(approvedDate)}
                      </span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="opcr-approved-role">Immediate Supervisor</td>
                  <td />
                  <td className="opcr-approved-role">Head of Office</td>
                  <td />
                </tr>
              </tbody>
            </table>
            <div className="opcr-print-fill">
              <OpcrFunctionsTable>
                  <tr className="opcr-section">
                    <td colSpan={8}>Core Function:</td>
                  </tr>
                  <OpcrItemRows
                    rows={section1Entries}
                    locked={locked}
                    editing={editingIdentity}
                    onUpdate={updateEntry}
                  />
              </OpcrFunctionsTable>
            </div>
          </div>

          <div className="opcr-print-page">
            <div className="opcr-print-fill">
              <OpcrFunctionsTable headClassName="opcr-repeat-head">
                  <OpcrItemRows
                    rows={section2Entries}
                    locked={locked}
                    editing={editingIdentity}
                    onUpdate={updateEntry}
                  />
              </OpcrFunctionsTable>
            </div>
          </div>

          <div className="opcr-print-page">
            <div className="opcr-print-fill">
              <OpcrFunctionsTable headClassName="opcr-repeat-head">
                  <OpcrItemRows
                    rows={section3Entries}
                    locked={locked}
                    editing={editingIdentity}
                    onUpdate={updateEntry}
                  />
              </OpcrFunctionsTable>
            </div>
          </div>

          <div className="opcr-print-page">
            <div className="opcr-print-fill">
              <OpcrFunctionsTable headClassName="opcr-repeat-head">
                  <OpcrItemRows
                    rows={section4Entries}
                    locked={locked}
                    editing={editingIdentity}
                    onUpdate={updateEntry}
                  />
              </OpcrFunctionsTable>
            </div>
          </div>

          <div className="opcr-print-page">
            <div className="opcr-print-fill">
            <table className="opcr-functions">
              <OpcrColGroup />
              <tbody>
                <tr className="opcr-average">
                  <td colSpan={3}>Final Average Rating</td>
                  <td className="text-center" />
                  <td className="text-center" />
                  <td className="text-center" />
                  <td className="text-center">{average != null ? formatAverage(average) : ''}</td>
                  <td />
                </tr>
                <tr>
                  <td colSpan={8} className="font-bold">
                    Comments and Recommendation for Development Purposes
                  </td>
                </tr>
                <tr className="opcr-comments-row">
                  <td colSpan={8}>
                    {editingIdentity && !locked ? (
                      <textarea
                        className="field opcr-comments-box"
                        value={comments}
                        onChange={(event) => setComments(event.target.value)}
                        placeholder="Enter comments and recommendations"
                      />
                    ) : (
                      <p className="opcr-comments-box whitespace-pre-wrap">{comments}</p>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
            <table className="opcr-closing">
              <colgroup>
                <col style={{ width: '20%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '10%' }} />
              </colgroup>
              <tbody>
                <tr>
                  <td className="opcr-closing-head">Discussed with:</td>
                  <td className="opcr-closing-head">Date</td>
                  <td className="opcr-closing-head">Assessed by:</td>
                  <td className="opcr-closing-head">Date</td>
                  <td className="opcr-closing-head">Final Rating by:</td>
                  <td className="opcr-closing-head">Date</td>
                </tr>
                <tr>
                  <td className="opcr-closing-sign">
                    <p className="opcr-approved-name">{staffName}</p>
                    {staffPosition ? <p className="opcr-approved-position">{staffPosition}</p> : null}
                    <p className="opcr-closing-role">Employee</p>
                  </td>
                  <td className="opcr-closing-date">
                    <ClosingDate
                      editing={editingIdentity}
                      locked={locked}
                      value={discussedDate}
                      onChange={setDiscussedDate}
                    />
                  </td>
                  <td className="opcr-closing-sign">
                    <p className="opcr-closing-cert">
                      I certify that I discussed my assessment of the performance with the employee
                    </p>
                    {editingIdentity && !locked ? (
                      <div className="space-y-1">
                        <input
                          className="opcr-approved-name"
                          value={assessedName}
                          onChange={(event) => setAssessedName(event.target.value)}
                          placeholder="Supervisor name"
                        />
                        <input
                          className="opcr-approved-position"
                          value={assessedPosition}
                          onChange={(event) => setAssessedPosition(event.target.value)}
                          placeholder="Position"
                        />
                      </div>
                    ) : (
                      <>
                        <p className="opcr-approved-name">{assessedName}</p>
                        <p className="opcr-approved-position">{assessedPosition}</p>
                      </>
                    )}
                    <p className="opcr-closing-role">Supervisor</p>
                  </td>
                  <td className="opcr-closing-date">
                    <ClosingDate
                      editing={editingIdentity}
                      locked={locked}
                      value={assessedDate}
                      onChange={setAssessedDate}
                    />
                  </td>
                  <td className="opcr-closing-sign">
                    {editingIdentity && !locked ? (
                      <input
                        className="opcr-approved-name"
                        value={finalRaterName}
                        onChange={(event) => setFinalRaterName(event.target.value)}
                        placeholder="Final rater"
                      />
                    ) : (
                      <p className="opcr-approved-name">{finalRaterName}</p>
                    )}
                  </td>
                  <td className="opcr-closing-date">
                    <ClosingDate
                      editing={editingIdentity}
                      locked={locked}
                      value={finalRatingDate}
                      onChange={setFinalRatingDate}
                    />
                  </td>
                </tr>
                <tr>
                  <td colSpan={6} className="opcr-closing-legend">
                    <strong>Legend:</strong> 1 - Quantity 2 - Efficiency 3 - Timeliness 4 - Average
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-500 print-hide">
          Q = Quality · E = Efficiency · T = Timeliness · A = Average
          {average != null ? ` · Current average ${formatAverage(form?.final_average ?? average)}` : ''}
        </p>
      </article>

      <Toast message={toast} phase={toastPhase} tone={toastTone} />
    </div>
  )
}
