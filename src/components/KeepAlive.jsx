import { useEffect, useState } from 'react'

/** Keep page mounted after first visit so route changes do not remount or refetch. */
export default function KeepAlive({ active, children }) {
  const [mounted, setMounted] = useState(active)

  useEffect(() => {
    if (active) setMounted(true)
  }, [active])

  if (!mounted) return null

  return (
    <div hidden={!active} className={active ? '' : 'hidden'} aria-hidden={!active}>
      {children}
    </div>
  )
}
