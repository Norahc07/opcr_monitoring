import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, Plus, X } from 'lucide-react'
import { Button } from './ui'
import { formatCount, toCount } from '../lib/opcr'

export default function CountEditModal({
  mode,
  title,
  detail,
  current = 0,
  saving = false,
  onClose,
  onConfirm,
}) {
  const inputRef = useRef(null)
  const isAdd = mode === 'add'
  const [amount, setAmount] = useState(isAdd ? '' : String(toCount(current) || ''))

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const entered = toCount(amount)
  const nextValue = isAdd ? toCount(current) + entered : entered
  const canSubmit = !saving && (isAdd ? entered > 0 : amount !== '')

  function submit(event) {
    event.preventDefault()
    if (!canSubmit) return
    onConfirm(nextValue)
  }

  const node = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40"
        aria-label="Close"
        onClick={saving ? undefined : onClose}
      />
      <form
        className="card relative z-10 w-full max-w-md p-5 shadow-2xl"
        onSubmit={submit}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {isAdd ? 'Add count' : 'Update count'}
            </h3>
            {title ? <p className="mt-1 text-sm font-medium text-slate-700">{title}</p> : null}
            {detail ? <p className="mt-0.5 text-xs text-slate-500">{detail}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-slate-600">
          Current value: <span className="font-bold text-slate-900">{formatCount(current)}</span>
        </p>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            {isAdd ? 'Number to add' : 'New value'}
          </span>
          <input
            ref={inputRef}
            type="number"
            min="0"
            step="0.1"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="field h-11 w-full text-center text-lg font-bold"
            placeholder="0"
            aria-label={isAdd ? 'Number to add' : 'New value'}
          />
        </label>

        {isAdd ? (
          <p className="mt-2 text-sm text-slate-600">
            After add:{' '}
            <span className="font-bold text-teal-800">
              {formatCount(current)} + {formatCount(entered)} = {formatCount(nextValue)}
            </span>
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" type="button" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {saving ? 'Saving…' : isAdd ? 'Add' : 'Update'}
          </Button>
        </div>
      </form>
    </div>
  )

  if (typeof document === 'undefined') return node
  return createPortal(node, document.body)
}

export function CountActions({ onAdd, onUpdate, disabled = false }) {
  return (
    <div className="count-actions print-hide">
      <button type="button" className="count-action-btn" disabled={disabled} onClick={onAdd}>
        <Plus size={11} />
        Add
      </button>
      <button type="button" className="count-action-btn" disabled={disabled} onClick={onUpdate}>
        <Pencil size={11} />
        Update
      </button>
    </div>
  )
}
