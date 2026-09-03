import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Check, GripVertical, Pencil, Plus, Printer, Trash2, X } from 'lucide-react'
import { Alert, Button, LoadingState, Toast, useToast } from '../components/ui'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'
import { writeAudit } from '../lib/audit'
import {
  alignedMapFromBoardCache,
  alignedNamesForEntry,
  buildAlignedAccountableMap,
  calcFinalAverage,
  ensureUserForm,
  extraAccountableNames,
  formatAverage,
  formatDateDisplay,
  getActivePeriod,
  groupOpcrSectionEntries,
  isPrimaryOpcrEntry,
  isTempEntryId,
  joinExtraAccountable,
  loadTallyContext,
  readApprovedCache,
  readBoardCache,
  readClosingCache,
  readHeaderCache,
  readMyOpcrCache,
  saveOpcrRows,
  saveFormSigner,
  toDateValue,
  writeApprovedCache,
  writeClosingCache,
  writeHeaderCache,
  writeMyOpcrCache,
} from '../lib/opcr'
import { normalizeSection } from '../lib/coreFunctions'

const DEFAULT_OPCR_HEADER_TITLE = 'Office Performance Commitment and Review (OPCR)'
const DEFAULT_OPCR_HEADER_OFFICE =
  'Office of the Municipal Mayor (Mauban eLearningVille) of the Local Government Unit of Mauban, Quezon'

function defaultOpcrCommitmentLine(year) {
  return `commit to deliver and agree to be rated on the attainment of the following targets in accordance with the indicated measures for the period of January to December ${year}.`
}

function defaultOpcrIntroLine(year) {
  return `${DEFAULT_OPCR_HEADER_OFFICE}\n${defaultOpcrCommitmentLine(year)}`
}

function buildHeaderIntroLine(form, cached, year) {
  if (cached?.introLine?.trim()) return cached.introLine.trim()
  const office = form?.header_office_line?.trim() || cached?.officeLine?.trim() || ''
  const commitment = form?.header_commitment_line?.trim() || cached?.commitmentLine?.trim() || ''
  if (office && commitment) return `${office}\n${commitment}`
  if (office) return office
  if (commitment) return commitment
  return defaultOpcrIntroLine(year)
}

const HEAD_OF_OFFICE = 'HON. BAUTISTA ERWIN DWIGHT C. PASTRANA'
const HEAD_OF_OFFICE_TITLE = 'Municipal Mayor'
const ASSESSOR_NAME = 'CONCHITA MARTA B. MIRABUENO'
const ASSESSOR_TITLE = 'MGDH1-Center Manager'

const OPCR_RATING_SCALE = [
  { level: 'Outstanding', range: '130% and above', rating: '5' },
  { level: 'Very Satisfactory', range: '115-129%', rating: '4' },
  { level: 'Satisfactory', range: '90-114%', rating: '3' },
  { level: 'Unsatisfactory', range: '51-89%', rating: '2' },
  { level: 'Poor', range: '50% and below', rating: '1' },
]

function OpcrRatingScale() {
  return (
    <table className="opcr-rating-scale">
      <colgroup>
        <col className="opcr-rating-scale-col-level" />
        <col className="opcr-rating-scale-col-range" />
        <col className="opcr-rating-scale-col-score" />
      </colgroup>
      <tbody>
        {OPCR_RATING_SCALE.map((row) => (
          <tr key={row.level}>
            <td className="opcr-rating-scale-level">{row.level}</td>
            <td className="opcr-rating-scale-range">{row.range}</td>
            <td className="opcr-rating-scale-score">{row.rating}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function sortSection(entries, section) {
  return entries
    .filter((entry) => normalizeSection(entry.section) === section)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
}

function reorderEntries(entries, draggedId, toSection, beforeId) {
  const moving = entries.find((entry) => entry.id === draggedId)
  if (!moving || !isPrimaryOpcrEntry(moving)) return entries

  const groupIds = new Set([
    moving.id,
    ...entries.filter((entry) => entry.parent_entry_id === moving.id).map((entry) => entry.id),
  ])
  const groupEntries = entries
    .filter((entry) => groupIds.has(entry.id))
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
  const others = entries.filter((entry) => !groupIds.has(entry.id))
  const targetSection = normalizeSection(toSection)
  const next = []

  for (const section of [1, 2]) {
    let primaries = others
      .filter((entry) => normalizeSection(entry.section) === section && isPrimaryOpcrEntry(entry))
      .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))

    if (section === targetSection) {
      let insertAt = beforeId ? primaries.findIndex((entry) => entry.id === beforeId) : -1
      if (insertAt < 0) insertAt = primaries.length
      primaries = [...primaries.slice(0, insertAt), moving, ...primaries.slice(insertAt)]
    }

    primaries.forEach((primary, index) => {
      const baseOrder = (index + 1) * 10
      const lines =
        primary.id === moving.id
          ? groupEntries
          : others
              .filter((entry) => entry.id === primary.id || entry.parent_entry_id === primary.id)
              .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))

      lines.forEach((entry, lineIndex) => {
        next.push({
          ...entry,
          section,
          sort_order: baseOrder + lineIndex,
        })
      })
    })
  }

  return next
}

function extrasWithoutAligned(text, aligned) {
  const folds = new Set((aligned || []).map((name) => String(name).toLowerCase()))
  return extraAccountableNames(text).filter((name) => !folds.has(name.toLowerCase()))
}

function alignedMapHasNames(map) {
  return Object.values(map || {}).some((names) => names?.length)
}

function mergeAlignedMaps(live, cached) {
  const out = { ...(live || {}) }
  for (const [key, names] of Object.entries(cached || {})) {
    if (!names?.length) continue
    if (!out[key]?.length) {
      out[key] = names
      continue
    }
    const seen = new Set(out[key].map((name) => String(name).toLowerCase()))
    const next = [...out[key]]
    for (const name of names) {
      const fold = String(name).toLowerCase()
      if (seen.has(fold)) continue
      seen.add(fold)
      next.push(name)
    }
    out[key] = next
  }
  return out
}

function AccountablePeople({ aligned = [], extrasText = '', editing, locked, onChangeExtras }) {
  const extras = extrasWithoutAligned(extrasText, aligned)
  const [draft, setDraft] = useState('')
  const [editIndex, setEditIndex] = useState(null)
  const [editValue, setEditValue] = useState('')
  const canEdit = editing && !locked

  function commit(next) {
    onChangeExtras(joinExtraAccountable(next))
    setEditIndex(null)
    setEditValue('')
  }

  function addName() {
    const name = draft.trim()
    if (!name) return
    const folds = new Set(
      [...aligned, ...extras].map((row) => String(row).toLowerCase()),
    )
    if (folds.has(name.toLowerCase())) {
      setDraft('')
      return
    }
    commit([...extras, name])
    setDraft('')
  }

  function saveEdit() {
    const name = editValue.trim()
    if (editIndex == null) return
    if (!name) {
      commit(extras.filter((_, index) => index !== editIndex))
      return
    }
    commit(extras.map((row, index) => (index === editIndex ? name : row)))
  }

  return (
    <div className="opcr-accountable">
      {aligned.length === 0 && extras.length === 0 && !canEdit ? null : (
        <ul className="opcr-accountable-list">
          {aligned.map((name) => (
            <li key={`auto-${name}`}>{name}</li>
          ))}
          {extras.map((name, index) => (
            <li key={`extra-${name}-${index}`}>
              {canEdit && editIndex === index ? (
                <div className="opcr-accountable-edit print-hide">
                  <input
                    className="field"
                    value={editValue}
                    onChange={(event) => setEditValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        saveEdit()
                      }
                      if (event.key === 'Escape') setEditIndex(null)
                    }}
                    aria-label="Edit name"
                  />
                  <button type="button" onClick={saveEdit} title="Save name">
                    <Check size={12} />
                  </button>
                  <button type="button" onClick={() => setEditIndex(null)} title="Cancel">
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <span className="opcr-accountable-extra">
                  {name}
                  {canEdit && (
                    <span className="opcr-accountable-actions print-hide">
                      <button
                        type="button"
                        title="Edit name"
                        onClick={() => {
                          setEditIndex(index)
                          setEditValue(name)
                        }}
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        type="button"
                        title="Remove name"
                        onClick={() => commit(extras.filter((_, row) => row !== index))}
                      >
                        <Trash2 size={11} />
                      </button>
                    </span>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="opcr-accountable-add print-hide">
          <input
            className="field"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addName()
              }
            }}
            placeholder="Add a name not in the roster"
            aria-label="Add a name not in the roster"
          />
          <button type="button" className="opcr-accountable-add-btn" onClick={addName}>
            <Plus size={12} />
            Add
          </button>
        </div>
      )}
    </div>
  )
}

const OPCR_TABLE_COLS = 9

function OpcrColGroup() {
  return (
    <colgroup>
      <col className="opcr-col-output" />
      <col className="opcr-col-success" />
      <col className="opcr-col-accountable" />
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
          Success Indicator{' '}
          <span className="opcr-head-note">(Target + Measures)</span>
        </th>
        <th rowSpan={2}>
          Divisions/Individuals{' '}
          <span className="opcr-head-note">Accountable</span>
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

function OpcrLineCells({
  entry,
  locked,
  editing,
  onUpdate,
  onRemoveIndicator,
  accountableEntry,
  accountableRowSpan,
  alignedNames,
}) {
  return (
    <>
      <td className="align-top leading-6 text-slate-700">
        {editing && !locked ? (
          <div className="space-y-2">
            <textarea
              value={entry.success_indicator || ''}
              onChange={(event) => onUpdate(entry.id, 'success_indicator', event.target.value)}
              className="field min-h-16"
              placeholder="Success indicator (target + measures)"
            />
            {!isPrimaryOpcrEntry(entry) && (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 print-hide hover:text-rose-800"
                onClick={() => onRemoveIndicator(entry.id)}
              >
                <Trash2 size={12} />
                Remove indicator
              </button>
            )}
          </div>
        ) : (
          <p className="whitespace-pre-wrap">{entry.success_indicator || ''}</p>
        )}
      </td>
      {accountableEntry ? (
        <td rowSpan={accountableRowSpan} className="align-top leading-6 text-slate-700">
          <AccountablePeople
            aligned={alignedNames}
            extrasText={accountableEntry.accountable || ''}
            editing={editing}
            locked={locked}
            onChangeExtras={(value) => onUpdate(accountableEntry.id, 'accountable', value)}
          />
        </td>
      ) : null}
      <td>
        {editing && !locked ? (
          <textarea
            value={entry.actual_accomplishment || ''}
            onChange={(event) => onUpdate(entry.id, 'actual_accomplishment', event.target.value)}
            className="field"
            placeholder="Enter actual accomplishment"
          />
        ) : (
          <p className="min-h-16 whitespace-pre-wrap">{entry.actual_accomplishment || ''}</p>
        )}
      </td>
      {['rating_q', 'rating_e', 'rating_t', 'rating_a'].map((field) => (
        <td key={field} className="text-center align-middle font-semibold text-slate-500">
          {entry[field] ? formatAverage(entry[field]) : ''}
        </td>
      ))}
      <td>
        {editing && !locked ? (
          <textarea
            value={entry.remarks || ''}
            onChange={(event) => onUpdate(entry.id, 'remarks', event.target.value)}
            className="field"
            placeholder="Remarks"
          />
        ) : (
          <p className="min-h-16 whitespace-pre-wrap">{entry.remarks || ''}</p>
        )}
      </td>
    </>
  )
}

function OpcrFunctionGroups({
  groups,
  section,
  locked,
  editing,
  gripId,
  dragId,
  dropId,
  onUpdate,
  onRemove,
  onAddIndicator,
  onGrip,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  alignedByOutput = {},
}) {
  const canDrag = editing && !locked

  return groups.flatMap(({ primary, lines }) =>
    lines.map((entry, lineIndex) => {
      const isPrimary = lineIndex === 0
      const canDragGroup = canDrag && isPrimary
      return (
        <tr
          key={entry.id}
          draggable={canDragGroup && gripId === primary.id}
          className={
            dragId === primary.id && isPrimary
              ? 'opcr-row-dragging'
              : dropId === primary.id && isPrimary
                ? 'opcr-row-drop'
                : lineIndex > 0
                  ? 'opcr-line-continued'
                  : undefined
          }
          onDragStart={(event) => {
            if (!canDragGroup || gripId !== primary.id) {
              event.preventDefault()
              return
            }
            event.dataTransfer.setData('text/plain', String(primary.id))
            event.dataTransfer.effectAllowed = 'move'
            onDragStart(primary.id)
          }}
          onDragOver={(event) => {
            if (!canDragGroup || !dragId || dragId === primary.id || !isPrimary) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            onDragOver(primary.id)
          }}
          onDrop={(event) => {
            if (!isPrimary) return
            event.preventDefault()
            const id = event.dataTransfer.getData('text/plain') || dragId
            onDrop(id, section, primary.id)
          }}
          onDragEnd={onDragEnd}
        >
          {isPrimary ? (
            <td rowSpan={lines.length} className="align-top font-bold text-slate-900">
              {canDragGroup ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span
                      className="opcr-drag-handle print-hide mt-1"
                      title="Drag to move this function"
                      aria-label="Drag function"
                      onMouseDown={() => onGrip(primary.id)}
                    >
                      <GripVertical size={16} />
                    </span>
                    <textarea
                      value={primary.output || ''}
                      onChange={(event) => onUpdate(primary.id, 'output', event.target.value)}
                      className="field min-h-16 flex-1 font-bold"
                      placeholder="Output"
                    />
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 print-hide hover:text-teal-950"
                    onClick={() => onAddIndicator(primary.id)}
                  >
                    <Plus size={12} />
                    Add success indicator
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 print-hide hover:text-rose-800"
                    onClick={() => onRemove(primary.id)}
                  >
                    <Trash2 size={12} />
                    Remove function
                  </button>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{primary.output || ''}</p>
              )}
            </td>
          ) : null}
          <OpcrLineCells
            entry={entry}
            locked={locked}
            editing={editing}
            onUpdate={onUpdate}
            onRemoveIndicator={onRemove}
            accountableEntry={isPrimary ? primary : null}
            accountableRowSpan={isPrimary ? lines.length : 0}
            alignedNames={alignedNamesForEntry(primary, alignedByOutput)}
          />
        </tr>
      )
    }),
  )
}

function AddOpcrRow({
  editing,
  locked,
  section,
  dropId,
  dragId,
  onAdd,
  onDragOver,
  onDrop,
}) {
  if (!editing || locked) return null
  return (
    <tr
      className={`opcr-add-row print-hide ${dropId === `section-${section}` ? 'opcr-row-drop' : ''}`}
      onDragOver={(event) => {
        if (!dragId) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        onDragOver(`section-${section}`)
      }}
      onDrop={(event) => {
        event.preventDefault()
        const id = event.dataTransfer.getData('text/plain') || dragId
        onDrop(id, section, null)
      }}
    >
      <td colSpan={OPCR_TABLE_COLS} className="bg-slate-50">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-2 text-sm font-semibold text-teal-800 hover:text-teal-950"
        >
          <Plus size={16} />
          Add row
        </button>
        <span className="ml-3 text-xs font-medium text-slate-500">
          or drop a row here to move it to this section
        </span>
      </td>
    </tr>
  )
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
  const [headerTitle, setHeaderTitle] = useState(DEFAULT_OPCR_HEADER_TITLE)
  const [headerIntroLine, setHeaderIntroLine] = useState(() =>
    defaultOpcrIntroLine(new Date().getFullYear()),
  )
  const [comments, setComments] = useState('')
  const [assessedName, setAssessedName] = useState(ASSESSOR_NAME)
  const [assessedPosition, setAssessedPosition] = useState(ASSESSOR_TITLE)
  const [discussedDate, setDiscussedDate] = useState('')
  const [assessedDate, setAssessedDate] = useState('')
  const [finalRaterName, setFinalRaterName] = useState('')
  const [finalRatingDate, setFinalRatingDate] = useState('')
  const [editingIdentity, setEditingIdentity] = useState(false)
  const [removedIds, setRemovedIds] = useState([])
  const [gripId, setGripId] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [dropId, setDropId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [alignedByOutput, setAlignedByOutput] = useState(() => alignedMapFromBoardCache(readBoardCache()))
  const location = useLocation()
  const editSnapshotRef = useRef(null)
  const editingIdentityRef = useRef(false)

  useEffect(() => {
    editingIdentityRef.current = editingIdentity
  }, [editingIdentity])

  const locked = form?.status === 'reviewed' || form?.status === 'finalized'
  const year = Math.max(Number(period?.year) || 0, new Date().getFullYear())
  const average = useMemo(() => calcFinalAverage(entries), [entries])

  const section1Groups = useMemo(() => groupOpcrSectionEntries(entries, 1), [entries])
  const section2Groups = useMemo(() => groupOpcrSectionEntries(entries, 2), [entries])

  useEffect(() => {
    let active = true

    function applySnapshot(snapshot, { preserveEdit = false } = {}) {
      if (!snapshot) return
      setPeriod(snapshot.period || null)
      setForm(snapshot.form || null)
      setEntries(snapshot.entries || [])
      setStaffName(snapshot.staffName || '')
      setStaffPosition(snapshot.staffPosition || '')
      setHeaderTitle(snapshot.headerTitle || DEFAULT_OPCR_HEADER_TITLE)
      setHeaderIntroLine(
        snapshot.headerIntroLine ||
          defaultOpcrIntroLine(
            Math.max(Number(snapshot.period?.year) || 0, new Date().getFullYear()),
          ),
      )
      setApprovedName(snapshot.approvedName || HEAD_OF_OFFICE)
      setApprovedPosition(snapshot.approvedPosition || HEAD_OF_OFFICE_TITLE)
      setApprovedDate(snapshot.approvedDate || '')
      setComments(snapshot.comments || '')
      setAssessedName(snapshot.assessedName || ASSESSOR_NAME)
      setAssessedPosition(snapshot.assessedPosition || ASSESSOR_TITLE)
      setDiscussedDate(snapshot.discussedDate || '')
      setAssessedDate(snapshot.assessedDate || '')
      setFinalRaterName(snapshot.finalRaterName || '')
      setFinalRatingDate(snapshot.finalRatingDate || '')
      if (!preserveEdit) {
        setRemovedIds([])
        setEditingIdentity(false)
        editSnapshotRef.current = null
      }
    }

    async function load({ silent = false } = {}) {
      if (!supabase || !user) {
        setLoading(false)
        return
      }

      if (!silent) setLoading(true)

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

        const approvedCached = readApprovedCache(bundle.form?.id)
        const closing = readClosingCache(bundle.form?.id)
        const headerCached = readHeaderCache(bundle.form?.id)
        const activeYear = Math.max(Number(activePeriod?.year) || 0, new Date().getFullYear())

        const snapshot = {
          userId: user.id,
          period: activePeriod,
          form: bundle.form,
          entries: bundle.entries || [],
          staffName: bundle.form?.signer_name?.trim() || profile?.full_name || '',
          staffPosition: bundle.form?.signer_position?.trim() || profile?.position || '',
          headerTitle:
            bundle.form?.header_title?.trim() || headerCached?.title || DEFAULT_OPCR_HEADER_TITLE,
          headerIntroLine: buildHeaderIntroLine(bundle.form, headerCached, activeYear),
          approvedName: bundle.form?.approved_name?.trim() || approvedCached?.name || HEAD_OF_OFFICE,
          approvedPosition:
            bundle.form?.approved_position?.trim() ||
            approvedCached?.position ||
            HEAD_OF_OFFICE_TITLE,
          approvedDate: toDateValue(bundle.form?.approved_date) || toDateValue(approvedCached?.date),
          comments: bundle.form?.comments || closing?.comments || '',
          assessedName: bundle.form?.assessed_name?.trim() || closing?.assessedName || ASSESSOR_NAME,
          assessedPosition:
            bundle.form?.assessed_position?.trim() || closing?.assessedPosition || ASSESSOR_TITLE,
          discussedDate:
            toDateValue(bundle.form?.discussed_date) || toDateValue(closing?.discussedDate),
          assessedDate:
            toDateValue(bundle.form?.assessed_date) || toDateValue(closing?.assessedDate),
          finalRaterName: bundle.form?.final_rater_name || closing?.finalRaterName || '',
          finalRatingDate:
            toDateValue(bundle.form?.final_rating_date) || toDateValue(closing?.finalRatingDate),
        }

        applySnapshot(snapshot, { preserveEdit: editingIdentityRef.current })
        writeMyOpcrCache(snapshot)
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }

    const cached = readMyOpcrCache(user?.id)
    if (cached) {
      applySnapshot(cached)
      setLoading(false)
      load({ silent: true })
    } else {
      load({ silent: false })
    }

    return () => {
      active = false
    }
  }, [user?.id])

  useEffect(() => {
    let active = true

    function applyAlignedCache({ evenEmpty = false } = {}) {
      const cached = alignedMapFromBoardCache(readBoardCache())
      if (evenEmpty ? Object.keys(cached).length : alignedMapHasNames(cached)) {
        setAlignedByOutput(cached)
      }
      return cached
    }

    async function refreshAligned() {
      applyAlignedCache()
      if (!supabase) return
      try {
        const context = await loadTallyContext(supabase, { includePeople: true })
        if (!active) return
        const live = buildAlignedAccountableMap(
          context.people,
          context.items,
          context.tallies,
          context.personItemByOutput,
        )
        const latestCache = alignedMapFromBoardCache(readBoardCache())
        setAlignedByOutput(mergeAlignedMaps(live, latestCache))
      } catch {
        if (!active) return
        applyAlignedCache()
      }
    }

    if (location.pathname === '/opcr') void refreshAligned()

    function onTallyUpdated() {
      applyAlignedCache({ evenEmpty: true })
    }
    window.addEventListener('opcr-tally-updated', onTallyUpdated)
    return () => {
      active = false
      window.removeEventListener('opcr-tally-updated', onTallyUpdated)
    }
  }, [location.pathname])

  useEffect(() => {
    function onUp() {
      if (!dragId) setGripId(null)
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [dragId])

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

  function captureEditSnapshot() {
    return {
      entries: JSON.parse(JSON.stringify(entries)),
      removedIds: [...removedIds],
      staffName,
      staffPosition,
      headerTitle,
      headerIntroLine,
      approvedName,
      approvedPosition,
      approvedDate,
      comments,
      assessedName,
      assessedPosition,
      discussedDate,
      assessedDate,
      finalRaterName,
      finalRatingDate,
    }
  }

  function enterEditMode() {
    if (!editSnapshotRef.current) {
      editSnapshotRef.current = captureEditSnapshot()
    }
    setEditingIdentity(true)
    const cached = alignedMapFromBoardCache(readBoardCache())
    if (alignedMapHasNames(cached)) setAlignedByOutput(cached)
    if (supabase) {
      loadTallyContext(supabase, { includePeople: true })
        .then((context) => {
          setAlignedByOutput(
            mergeAlignedMaps(
              buildAlignedAccountableMap(
                context.people,
                context.items,
                context.tallies,
                context.personItemByOutput,
              ),
              alignedMapFromBoardCache(readBoardCache()),
            ),
          )
        })
        .catch(() => {})
    }
  }

  async function cancelEdit() {
    const snap = editSnapshotRef.current
    clearDrag()
    setEditingIdentity(false)
    editSnapshotRef.current = null
    if (!snap) return

    setEntries(snap.entries)
    setRemovedIds(snap.removedIds)
    setStaffName(snap.staffName)
    setStaffPosition(snap.staffPosition)
    setHeaderTitle(snap.headerTitle)
    setHeaderIntroLine(snap.headerIntroLine)
    setApprovedName(snap.approvedName)
    setApprovedPosition(snap.approvedPosition)
    setApprovedDate(snap.approvedDate)
    setComments(snap.comments)
    setAssessedName(snap.assessedName)
    setAssessedPosition(snap.assessedPosition)
    setDiscussedDate(snap.discussedDate)
    setAssessedDate(snap.assessedDate)
    setFinalRaterName(snap.finalRaterName)
    setFinalRatingDate(snap.finalRatingDate)

    if (!form?.id || !supabase) return

    writeApprovedCache(form.id, {
      name: snap.approvedName,
      position: snap.approvedPosition,
      date: snap.approvedDate,
    })
    writeClosingCache(form.id, {
      comments: snap.comments,
      assessedName: snap.assessedName,
      assessedPosition: snap.assessedPosition,
      discussedDate: snap.discussedDate,
      assessedDate: snap.assessedDate,
      finalRaterName: snap.finalRaterName,
      finalRatingDate: snap.finalRatingDate,
    })
    writeHeaderCache(form.id, {
      headerTitle: snap.headerTitle,
      headerIntroLine: snap.headerIntroLine,
    })

    try {
      await supabase
        .from('opcr_forms')
        .update({ approved_date: snap.approvedDate || null })
        .eq('id', form.id)
    } catch {
      // Local state is already restored.
    }
  }

  function updateEntry(id, field, value) {
    if (!id) return
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry)),
    )
  }

  function addRow(section) {
    if (!form?.id || locked) return
    const targetSection = normalizeSection(section)
    const inSection = entries.filter((entry) => normalizeSection(entry.section) === targetSection)
    const nextOrder =
      inSection.reduce((max, entry) => Math.max(max, Number(entry.sort_order) || 0), 0) + 10
    enterEditMode()
    setEntries((current) => [
      ...current,
      {
        id: `tmp-${crypto.randomUUID()}`,
        form_id: form.id,
        item_id: null,
        output: '',
        success_indicator: '',
        accountable: '',
        section: targetSection,
        sort_order: nextOrder,
        actual_accomplishment: '',
        remarks: '',
      },
    ])
  }

  function addIndicatorLine(parentId) {
    if (!form?.id || locked) return
    const parent = entries.find((entry) => entry.id === parentId)
    if (!parent || !isPrimaryOpcrEntry(parent)) return
    const groupLines = entries.filter(
      (entry) => entry.id === parentId || entry.parent_entry_id === parentId,
    )
    const nextOrder =
      groupLines.reduce((max, entry) => Math.max(max, Number(entry.sort_order) || 0), 0) + 1
    enterEditMode()
    setEntries((current) => [
      ...current,
      {
        id: `tmp-${crypto.randomUUID()}`,
        form_id: form.id,
        item_id: null,
        parent_entry_id: parentId,
        output: '',
        success_indicator: '',
        accountable: '',
        section: normalizeSection(parent.section),
        sort_order: nextOrder,
        actual_accomplishment: '',
        remarks: '',
      },
    ])
  }

  function clearAllFunctions() {
    if (!form?.id || locked || !entries.length) return
    const confirmed = window.confirm(
      'Remove all Core and Support functions from your OPCR? After you click Save, matching rows and counts on the tally board and daily log are removed too.',
    )
    if (!confirmed) return

    const persistedIds = entries.map((entry) => entry.id).filter((id) => !isTempEntryId(id))
    setRemovedIds((current) => [...new Set([...current, ...persistedIds])])
    setEntries([])
    enterEditMode()
  }

  function removeRow(id) {
    if (!id || locked) return
    const entry = entries.find((row) => row.id === id)
    if (!entry) return

    const idsToRemove = isPrimaryOpcrEntry(entry)
      ? [id, ...entries.filter((row) => row.parent_entry_id === id).map((row) => row.id)]
      : [id]

    setEntries((current) => current.filter((row) => !idsToRemove.includes(row.id)))
    for (const removeId of idsToRemove) {
      if (!isTempEntryId(removeId)) {
        setRemovedIds((current) => (current.includes(removeId) ? current : [...current, removeId]))
      }
    }
  }

  function clearDrag() {
    setGripId(null)
    setDragId(null)
    setDropId(null)
  }

  function moveRow(draggedId, toSection, beforeId) {
    if (!draggedId || locked) {
      clearDrag()
      return
    }
    setEntries((current) => reorderEntries(current, draggedId, toSection, beforeId))
    clearDrag()
  }

  async function persist() {
    if (!form) return
    setSaving(true)
    setError('')
    try {
      const cleanedEntries = entries.map((entry) => {
        if (!isPrimaryOpcrEntry(entry)) return entry
        return {
          ...entry,
          accountable: joinExtraAccountable(
            extrasWithoutAligned(entry.accountable, alignedNamesForEntry(entry, alignedByOutput)),
          ),
        }
      })
      const savedRows = await saveOpcrRows(supabase, form.id, cleanedEntries, removedIds)
      setEntries(savedRows)
      setRemovedIds([])
      const savedDate = await saveFormSigner(supabase, form.id, {
        name: staffName.trim(),
        position: staffPosition.trim(),
        headerTitle: headerTitle.trim(),
        headerIntroLine: headerIntroLine.trim(),
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
      writeHeaderCache(form.id, {
        headerTitle: headerTitle.trim(),
        headerIntroLine: headerIntroLine.trim(),
      })
      setForm((current) =>
        current
          ? {
              ...current,
              signer_name: staffName.trim(),
              signer_position: staffPosition.trim(),
              header_title: headerTitle.trim(),
              header_office_line: headerIntroLine.trim(),
              header_commitment_line: '',
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
      editSnapshotRef.current = null
      if (user?.id) {
        writeMyOpcrCache({
          userId: user.id,
          period,
          form: {
            ...form,
            signer_name: staffName.trim(),
            signer_position: staffPosition.trim(),
            header_title: headerTitle.trim(),
            header_office_line: headerIntroLine.trim(),
            header_commitment_line: '',
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
          },
          entries: savedRows,
          staffName: staffName.trim(),
          staffPosition: staffPosition.trim(),
          headerTitle: headerTitle.trim(),
          headerIntroLine: headerIntroLine.trim(),
          approvedName: approvedName.trim(),
          approvedPosition: approvedPosition.trim(),
          approvedDate: nextDate,
          comments: comments.trim(),
          assessedName: assessedName.trim(),
          assessedPosition: assessedPosition.trim(),
          discussedDate: nextDiscussed,
          assessedDate: nextAssessedOn,
          finalRaterName: finalRaterName.trim(),
          finalRatingDate: nextFinalOn,
        })
      }
      await writeAudit(
        supabase,
        'Saved OPCR',
        'My OPCR',
        period?.title || String(period?.year || year || ''),
      )
      showToast('OPCR saved. Tally board and daily log now match these rows.')
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

  const rowDrag = {
    locked,
    editing: editingIdentity,
    gripId,
    dragId,
    dropId,
    onUpdate: updateEntry,
    onRemove: removeRow,
    onAddIndicator: addIndicatorLine,
    onGrip: setGripId,
    onDragStart: setDragId,
    onDragOver: setDropId,
    onDrop: moveRow,
    onDragEnd: clearDrag,
    alignedByOutput,
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
              <>
                <Button variant="secondary" disabled={saving || !entries.length} onClick={clearAllFunctions}>
                  <Trash2 size={16} />
                  Clear all
                </Button>
                <Button variant="ghost" disabled={saving} onClick={cancelEdit}>
                  Cancel
                </Button>
                <Button disabled={saving} onClick={persist}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={enterEditMode}>
                <Pencil size={16} />
                Edit
              </Button>
            ))}
        </div>
        {editingIdentity && !locked && (
          <p className="print-hide mb-3 max-w-3xl pr-52 text-xs font-medium text-slate-500">
            Click <strong>Edit</strong> to change the document title, office lines, signer, functions, and closing section. Save or Cancel when done.
            Use <strong>Add success indicator</strong> for another target line under the same output.
            Use <strong>Clear all</strong> to remove every function and reset tally/daily counts after Save.
          </p>
        )}

        <div className="opcr-sheet mt-0">
          <div className="opcr-print-page">
            <header className="opcr-print-header space-y-5">
              {editingIdentity && !locked ? (
                <div className="opcr-header-fields space-y-3">
                  <input
                    className="opcr-header-title"
                    value={headerTitle}
                    onChange={(event) => setHeaderTitle(event.target.value)}
                    placeholder="Document title"
                  />
                  <textarea
                    className="opcr-header-line"
                    rows={5}
                    value={headerIntroLine}
                    onChange={(event) => setHeaderIntroLine(event.target.value)}
                    placeholder="Office and commitment lines"
                  />
                </div>
              ) : (
                <>
                  <h1 className="px-20 text-center text-xl font-bold tracking-wide text-slate-900 uppercase sm:px-28 sm:text-2xl">
                    {headerTitle}
                  </h1>
                  <p className="whitespace-pre-line text-center text-sm leading-6 text-slate-600">
                    {headerIntroLine}
                  </p>
                </>
              )}
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
                <col style={{ width: '85%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <tbody>
                <tr>
                  <td className="opcr-approved-label">Approved by:</td>
                  <td className="opcr-approved-label">Date</td>
                </tr>
                <tr>
                  <td className="opcr-approved-sign">
                    <div className="opcr-approved-signatory">
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
                    </div>
                    <OpcrRatingScale />
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
              </tbody>
            </table>
            <div className="opcr-print-fill">
              <OpcrFunctionsTable>
                  <tr className="opcr-section">
                    <td colSpan={OPCR_TABLE_COLS}>Core Functions: 80%</td>
                  </tr>
                  <OpcrFunctionGroups
                    groups={section1Groups}
                    section={1}
                    {...rowDrag}
                  />
                  <AddOpcrRow
                    editing={editingIdentity}
                    locked={locked}
                    section={1}
                    dragId={dragId}
                    dropId={dropId}
                    onAdd={() => addRow(1)}
                    onDragOver={setDropId}
                    onDrop={moveRow}
                  />
              </OpcrFunctionsTable>
            </div>
          </div>

          <div className="opcr-print-page">
            <div className="opcr-print-fill">
              <OpcrFunctionsTable headClassName="opcr-repeat-head">
                  <tr className="opcr-section">
                    <td colSpan={OPCR_TABLE_COLS}>Support Function: 20%</td>
                  </tr>
                  <OpcrFunctionGroups
                    groups={section2Groups}
                    section={2}
                    {...rowDrag}
                  />
                  <AddOpcrRow
                    editing={editingIdentity}
                    locked={locked}
                    section={2}
                    dragId={dragId}
                    dropId={dropId}
                    onAdd={() => addRow(2)}
                    onDragOver={setDropId}
                    onDrop={moveRow}
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
                  <td colSpan={4}>Final Average Rating</td>
                  <td className="text-center" />
                  <td className="text-center" />
                  <td className="text-center" />
                  <td className="text-center">{average != null ? formatAverage(average) : ''}</td>
                  <td />
                </tr>
                <tr>
                  <td colSpan={OPCR_TABLE_COLS} className="font-bold">
                    Comments and Recommendation for Development Purposes
                  </td>
                </tr>
                <tr className="opcr-comments-row">
                  <td colSpan={OPCR_TABLE_COLS}>
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
                    {editingIdentity && !locked ? (
                      <div className="space-y-1">
                        <input
                          className="opcr-approved-name"
                          value={staffName}
                          onChange={(event) => setStaffName(event.target.value)}
                          placeholder="Employee name"
                        />
                        <input
                          className="opcr-approved-position"
                          value={staffPosition}
                          onChange={(event) => setStaffPosition(event.target.value)}
                          placeholder="Position"
                        />
                      </div>
                    ) : (
                      <>
                        <p className="opcr-approved-name">
                          {staffName || <span className="opcr-signer-placeholder">Name</span>}
                        </p>
                        {staffPosition ? (
                          <p className="opcr-approved-position">{staffPosition}</p>
                        ) : null}
                      </>
                    )}
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
