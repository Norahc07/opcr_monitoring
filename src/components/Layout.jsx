import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  ChevronUp,
  ClipboardList,
  CalendarDays,
  LayoutGrid,
  ListChecks,
  LogOut,
  ScrollText,
  UserRound,
  Users,
} from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { Avatar, BrandLogo, Button } from './ui'
import KeepAlive from './KeepAlive'
import TallyBoard from '../pages/TallyBoard'
import MyTally from '../pages/MyTally'
import DailyLog from '../pages/DailyLog'
import MyOpcr from '../pages/MyOpcr'

const WORK_PATHS = new Set(['/', '/my-tally', '/daily', '/opcr'])

const linkClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
    isActive
      ? 'bg-white/15 text-white shadow-inner'
      : 'text-teal-100 hover:bg-white/10 hover:text-white'
  }`

export default function Layout() {
  const { profile, isAdmin, signOut, user } = useAuth()
  const { pathname } = useLocation()
  const displayName = profile?.full_name || user?.email || 'OPCR user'
  const [showTop, setShowTop] = useState(false)
  const showWorkPage = WORK_PATHS.has(pathname)

  useEffect(() => {
    function onScroll() {
      setShowTop(window.scrollY > 480)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[272px_1fr] print:block print:min-h-0">
      <aside className="bg-teal-950 text-white lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto print:hidden">
        <div className="px-5 py-6">
          <BrandLogo className="h-auto w-full max-w-[220px] object-contain" />
          <p className="mt-3 px-1 text-xs font-medium tracking-wide text-teal-200/80">
            OPCR Monitoring
          </p>
        </div>

        <nav className="flex gap-2 overflow-x-auto px-4 pb-4 lg:block lg:space-y-1 lg:overflow-visible">
          <p className="mb-2 hidden px-3 text-[11px] font-semibold tracking-[0.16em] text-teal-300/70 uppercase lg:block">
            Work
          </p>
          <NavLink to="/" end className={linkClass}>
            <LayoutGrid size={18} />
            Tally board
          </NavLink>
          <NavLink to="/my-tally" className={linkClass}>
            <ListChecks size={18} />
            My Tally
          </NavLink>
          <NavLink to="/daily" className={linkClass}>
            <CalendarDays size={18} />
            Daily log
          </NavLink>
          <NavLink to="/opcr" className={linkClass}>
            <ClipboardList size={18} />
            My OPCR
          </NavLink>
          <NavLink to="/profile" className={linkClass}>
            <UserRound size={18} />
            Profile
          </NavLink>
          {isAdmin && (
            <>
              <p className="mt-5 mb-2 hidden px-3 text-[11px] font-semibold tracking-[0.16em] text-teal-300/70 uppercase lg:block">
                Office
              </p>
              <NavLink to="/users" className={linkClass}>
                <Users size={18} />
                Users
              </NavLink>
              <NavLink to="/audit" className={linkClass}>
                <ScrollText size={18} />
                Audit logs
              </NavLink>
            </>
          )}
        </nav>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-white/60 bg-white/75 px-4 py-3 backdrop-blur-xl sm:px-6 print:hidden">
          <Link to="/profile" className="flex min-w-0 items-center gap-3 rounded-xl pr-2 hover:bg-white/70">
            <Avatar name={displayName} src={profile?.avatar_url || ''} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
              <p className="truncate text-xs text-slate-500">
                {profile?.position || 'Staff'} · {profile?.office || 'E-Learning Ville'} ·{' '}
                {isAdmin ? 'Admin' : 'Staff'}
              </p>
            </div>
          </Link>
          <Button variant="secondary" onClick={signOut}>
            <LogOut size={16} />
            Sign out
          </Button>
        </header>
        <main className="w-full p-4 sm:px-5 sm:py-6 print:p-0">
          <KeepAlive active={pathname === '/'}>
            <TallyBoard />
          </KeepAlive>
          {pathname === '/my-tally' && <MyTally />}
          <KeepAlive active={pathname === '/daily'}>
            <DailyLog />
          </KeepAlive>
          <KeepAlive active={pathname === '/opcr'}>
            <MyOpcr />
          </KeepAlive>
          {!showWorkPage && <Outlet />}
        </main>
        {showTop && (
          <button
            type="button"
            className="fixed right-5 bottom-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-teal-700 text-white shadow-lg transition hover:bg-teal-800 print:hidden sm:right-7 sm:bottom-7"
            aria-label="Back to top"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <ChevronUp size={22} />
          </button>
        )}
      </div>
    </div>
  )
}
