import { useEffect, useState } from 'react'
import { Monitor } from 'lucide-react'
import { BrandLogo } from './ui'

const MIN_DESKTOP_WIDTH = 1100

function isPhoneOrTablet() {
  if (typeof window === 'undefined') return false
  const width = window.innerWidth
  const ua = navigator.userAgent || ''
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  const mobileUa = /Mobi|Android|iPhone|iPod|iPad|Tablet|Silk|Kindle|PlayBook/i.test(ua) || iPadOS
  return width < MIN_DESKTOP_WIDTH || mobileUa
}

function BlockScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-teal-950 px-6 text-center text-white">
      <BrandLogo className="mb-8 h-14 w-auto max-w-[220px] object-contain" />
      <Monitor size={48} className="mb-4 text-emerald-300" />
      <h1 className="text-2xl font-semibold tracking-tight">Desktop only</h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-teal-100/85">
        This OPCR system is for desktop and laptop computers only. Phone and tablet screens are not
        supported. Please open it on a desktop.
      </p>
    </div>
  )
}

export default function DesktopOnly({ children }) {
  const [blocked, setBlocked] = useState(isPhoneOrTablet)

  useEffect(() => {
    function check() {
      setBlocked(isPhoneOrTablet())
    }
    check()
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    return () => {
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
    }
  }, [])

  if (blocked) return <BlockScreen />
  return children
}
