import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from './ui'

function ModalShell({ title, detail, onClose, children, onSubmit }) {
  const node = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close" onClick={onClose} />
      <form className="card relative z-10 w-full max-w-md p-5 shadow-2xl" onSubmit={onSubmit}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            {detail ? <p className="mt-1 text-sm text-slate-500">{detail}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </form>
    </div>
  )
  if (typeof document === 'undefined') return node
  return createPortal(node, document.body)
}

export function ColumnEditModal({ mode, current = '', canDelete = false, onClose, onSave, onDelete }) {
  const inputRef = useRef(null)
  const isAdd = mode === 'add'
  const [label, setLabel] = useState(isAdd ? '' : current)
  const canSubmit = Boolean(label.trim())

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <ModalShell
      title={isAdd ? 'Add column' : 'Edit column'}
      detail={isAdd ? 'This column will appear on every period of the report.' : current}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        if (!canSubmit) return
        onSave(label.trim())
      }}
    >
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-500">Column name</span>
        <input
          ref={inputRef}
          className="field"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="e.g. Scanning"
        />
      </label>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {!isAdd && canDelete ? (
          <Button variant="danger" type="button" className="mr-auto" onClick={onDelete}>
            Remove
          </Button>
        ) : null}
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {isAdd ? 'Add column' : 'Save'}
        </Button>
      </div>
    </ModalShell>
  )
}

export function CellEditModal({ mode, title, detail, current = '', onClose, onConfirm }) {
  const inputRef = useRef(null)
  const isAdd = mode === 'add'
  const [text, setText] = useState(isAdd ? '' : current)
  const preview = isAdd
    ? [current, text.trim()].filter(Boolean).join('\n')
    : text.trim()
  const canSubmit = isAdd ? Boolean(text.trim()) : true

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <ModalShell
      title={isAdd ? 'Add accomplishment' : 'Update accomplishment'}
      detail={detail}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        if (!canSubmit) return
        onConfirm(text)
      }}
    >
      {title ? <p className="text-sm font-medium text-slate-800">{title}</p> : null}
      {current ? (
        <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
          Current:{' '}
          <span className="font-semibold text-slate-900">{current}</span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-slate-500">No entry yet.</p>
      )}
      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-medium text-slate-500">
          {isAdd ? 'Text to add' : 'New value'}
        </span>
        <textarea
          ref={inputRef}
          className="field min-h-24"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={isAdd ? 'e.g. 1 CLIENT' : 'Leave blank to clear'}
        />
      </label>
      {isAdd && text.trim() ? (
        <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
          After add:{' '}
          <span className="font-semibold text-teal-800">{preview}</span>
        </p>
      ) : null}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {isAdd ? 'Add' : 'Update'}
        </Button>
      </div>
    </ModalShell>
  )
}
