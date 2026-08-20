import { statusLabel } from '../lib/opcr'

const STYLES = {
  draft: 'bg-slate-100 text-slate-700',
  submitted: 'bg-amber-100 text-amber-800',
  reviewed: 'bg-sky-100 text-sky-800',
  finalized: 'bg-emerald-100 text-emerald-800',
}

const DOTS = {
  draft: 'bg-slate-400',
  submitted: 'bg-amber-500',
  reviewed: 'bg-sky-500',
  finalized: 'bg-emerald-500',
}

export default function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STYLES[status] || STYLES.draft}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOTS[status] || DOTS.draft}`} />
      {statusLabel(status)}
    </span>
  )
}
