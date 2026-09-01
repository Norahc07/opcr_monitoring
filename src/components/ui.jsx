import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle2, Info, LoaderCircle, UserRound } from 'lucide-react'

export const LOGO_SRC = '/elearningville-logo.png'
export const LOGOMARK_SRC = '/logomark.png'

export function BrandLogo({ className = 'h-10 w-auto', ...props }) {
  return (
    <img
      src={LOGO_SRC}
      alt="e-LearningVille Mauban, Quezon"
      className={className}
      {...props}
    />
  )
}

export function BrandLogomark({ className = 'h-8 w-8 object-contain', ...props }) {
  return (
    <img
      src={LOGOMARK_SRC}
      alt="e-LearningVille"
      className={className}
      {...props}
    />
  )
}

function initials(name) {
  const parts = String(name || 'EV')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
  return parts.map((part) => part[0]).join('').toUpperCase() || 'EV'
}

export function Avatar({ name, src = '', size = 'md' }) {
  const sizes = {
    sm: 'h-8 w-8 text-[11px]',
    md: 'h-9 w-9 text-xs',
    lg: 'h-24 w-24 text-2xl',
    xl: 'h-[7.25rem] w-[7.25rem] text-3xl',
  }
  const iconSizes = { sm: 16, md: 18, lg: 42, xl: 52 }
  const box = `flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-teal-600 to-emerald-500 font-bold text-white ${sizes[size] || sizes.md}`
  if (src) {
    return <img src={src} alt={name || 'Profile'} className={`${box} object-cover`} />
  }
  if (name) {
    return <div className={box}>{initials(name)}</div>
  }
  return (
    <div className={`${box} bg-slate-200 text-slate-500`}>
      <UserRound size={iconSizes[size] || 18} />
    </div>
  )
}

export function PageHeader({ kicker, title, description, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {kicker && (
          <p className="text-xs font-semibold tracking-[0.18em] text-teal-700 uppercase">{kicker}</p>
        )}
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1.5 text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      {actions}
    </div>
  )
}

export function Toast({ message, phase, tone = 'success' }) {
  if (!message) return null
  const node = (
    <div
      className={`toast-popup ${tone === 'danger' ? 'is-danger' : ''} ${phase === 'out' ? 'is-out' : 'is-in'}`}
      role="status"
    >
      {message}
    </div>
  )
  if (typeof document === 'undefined') return node
  return createPortal(node, document.body)
}

export function useToast() {
  const [toast, setToast] = useState({ text: '', phase: '', tone: 'success', id: 0 })
  const timers = useRef({ hide: 0, clear: 0 })

  function showToast(text, tone = 'success') {
    const id = Date.now()
    window.clearTimeout(timers.current.hide)
    window.clearTimeout(timers.current.clear)
    setToast({ text, phase: 'in', tone, id })
    timers.current.hide = window.setTimeout(() => {
      setToast((current) => (current.id === id ? { ...current, phase: 'out' } : current))
    }, 2200)
    timers.current.clear = window.setTimeout(() => {
      setToast((current) => (current.id === id ? { text: '', phase: '', tone: 'success', id: 0 } : current))
    }, 2650)
  }

  function clearToast() {
    window.clearTimeout(timers.current.hide)
    window.clearTimeout(timers.current.clear)
    setToast({ text: '', phase: '', tone: 'success', id: 0 })
  }

  useEffect(
    () => () => {
      window.clearTimeout(timers.current.hide)
      window.clearTimeout(timers.current.clear)
    },
    [],
  )

  return {
    toast: toast.text,
    toastPhase: toast.phase,
    toastTone: toast.tone,
    showToast,
    clearToast,
  }
}

export function Alert({ tone = 'info', children }) {
  const styles = {
    info: 'bg-teal-50 text-teal-900 border-teal-100',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    warning: 'bg-amber-50 text-amber-900 border-amber-100',
    danger: 'bg-rose-50 text-rose-700 border-rose-100',
  }
  const Icon = { info: Info, success: CheckCircle2, warning: AlertCircle, danger: AlertCircle }[tone]
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${styles[tone]}`}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function Button({ children, variant = 'primary', className = '', type = 'button', ...props }) {
  const variants = {
    primary:
      'bg-teal-700 text-white shadow-sm hover:bg-teal-800 disabled:opacity-60',
    secondary:
      'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60',
    ghost: 'text-slate-600 hover:bg-white/70 disabled:opacity-60',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60',
  }
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-slate-500">
      <LoaderCircle size={18} className="animate-spin text-teal-700" />
      {label}
    </div>
  )
}

export function EmptyState({ title, body }) {
  return (
    <div className="card px-6 py-12 text-center">
      <p className="font-semibold text-slate-800">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{body}</p>
    </div>
  )
}

export function ProgressBar({ percent }) {
  const width = Math.max(0, Math.min(percent || 0, 100))
  return (
    <div className="progress-track">
      <div className="progress-fill" style={{ width: `${width}%` }} />
    </div>
  )
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-2xl bg-white/80 p-1 ring-1 ring-slate-200">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
            value === option.id ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
