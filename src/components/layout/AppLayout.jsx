import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import OfflineBanner from '../OfflineBanner'
import PullToRefresh from '../ui/PullToRefresh'
import LangSwitcher from '../ui/LangSwitcher'
import { useAuthStore } from '../../store/authStore'
import { useBadgeStore } from '../../store/badgeStore'
import { logout as fieldclockLogout } from '../../api/fieldclockAuth'

const BADGE_POLL_MS = 45_000

// ── Icons ─────────────────────────────────────────────────────────
const DashboardIcon = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
// A delivery truck — distinct from the box (Items) and clipboard (Orders)
// so the three most-used Inventory Lead nav entries don't all read as "a box."
const ReceiveIcon   = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2 16V7a1 1 0 011-1h9v10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 10h4.5L20 13.5V16h-2"/><path strokeLinecap="round" strokeLinejoin="round" d="M2 16h1M8.2 16h6.6"/><circle cx="6.5" cy="17" r="1.7"/><circle cx="16.5" cy="17" r="1.7"/></svg>
const ItemsIcon     = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
const VendorsIcon   = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
const LocationsIcon = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
const ReportsIcon   = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M18 20V10M12 20V4M6 20v-6"/></svg>
const TakeIcon      = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"/></svg>
// A clipboard/checklist — Orders is paperwork (a PO), not a box of goods.
const OrdersIcon    = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="6" y="4" width="12" height="17" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 3.5h6a1 1 0 011 1V6H8V4.5a1 1 0 011-1z"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 11h6M9 14.5h6M9 8h3"/></svg>
// Same clipboard body as Orders, but with a checkmark instead of plain
// lines — Counts is "go verify this," not paperwork.
const CountsIcon    = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="6" y="4" width="12" height="17" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 3.5h6a1 1 0 011 1V6H8V4.5a1 1 0 011-1z"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.5l2 2 4-4.5"/></svg>
const ProjectsIcon  = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5A2.5 2.5 0 015.5 5h4l2 2h7A2.5 2.5 0 0121 9.5v7A2.5 2.5 0 0118.5 19h-13A2.5 2.5 0 013 16.5v-9z"/></svg>
// A speech bubble with a plus — "I need something," not paperwork (Orders)
// or a box (Items). Distinct silhouette from every other nav icon.
const RequestsIcon  = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v5M9.5 10.5h5"/></svg>
const UsersIcon     = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
const LogoutIcon    = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline strokeLinecap="round" strokeLinejoin="round" points="16 17 21 12 16 7"/><line strokeLinecap="round" x1="21" y1="12" x2="9" y2="12"/></svg>
const MoreDotsIcon  = ({ s = 'w-6 h-6' }) => <svg className={s} viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>

// The small "needs your attention" bubble — a number for things with a
// meaningful count (open requests, orders needing a look), or a bare dot
// for things that are just true/false (an in-progress count). Parent must
// be positioned (relative) for this to land in the right spot.
function NavBadge({ count, dot }) {
  if (!dot && !count) return null
  return (
    <span className={`absolute -top-1 -right-1.5 flex items-center justify-center rounded-full bg-amber-500 ring-2 ring-white text-white ${
      dot ? 'w-2.5 h-2.5' : 'min-w-[17px] h-[17px] px-1 text-[10px] font-bold leading-none'
    }`}>
      {!dot && (count > 9 ? '9+' : count)}
    </span>
  )
}

function SidebarItem({ to, icon, label, end, badgeCount, badgeDot }) {
  return (
    <NavLink to={to} end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors ${
          isActive ? 'bg-brand-500 text-white' : 'text-brand-100/80 hover:bg-brand-700 hover:text-white'
        }`
      }>
      <span className="relative inline-flex shrink-0">{icon}<NavBadge count={badgeCount} dot={badgeDot} /></span>
      {label}
    </NavLink>
  )
}

export default function AppLayout() {
  const { t } = useTranslation()
  const [moreOpen,    setMoreOpen]    = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [refreshKey,  setRefreshKey]  = useState(0)
  const location = useLocation()
  const navigate = useNavigate()
  const { refreshToken, logout, user } = useAuthStore()
  const role = user?.role
  const isAdmin = role === 'admin'
  const canManage = role === 'admin' || role === 'specialist'
  const ROLE_LABELS = { admin: t('role.admin'), specialist: t('role.specialist'), user: t('role.user') }

  // Requests/Counts/Orders nav bubbles — "something here needs your look."
  // Only ever populated for specialist/admin (they're the ones who act on
  // any of this); refresh() is a deliberate no-op otherwise.
  const openRequestsCount    = useBadgeStore((s) => s.openRequestsCount)
  const ordersAttentionCount = useBadgeStore((s) => s.ordersAttentionCount)
  const hasCountsDraft       = useBadgeStore((s) => s.hasCountsDraft)
  const refreshBadges        = useBadgeStore((s) => s.refresh)

  useEffect(() => { refreshBadges(canManage) }, [canManage, location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!canManage) return
    const id = setInterval(() => refreshBadges(canManage), BADGE_POLL_MS)
    return () => clearInterval(id)
  }, [canManage]) // eslint-disable-line react-hooks/exhaustive-deps

  const PRIMARY = [
    { to: '/',              icon: <DashboardIcon />, label: t('nav.dashboard'), end: true },
    { to: '/take-dropoff',  icon: <TakeIcon />,      label: t('nav.takeDrop') },
    ...(canManage ? [
      { to: '/receiving', icon: <ReceiveIcon />, label: t('nav.receiving') },
    ] : [
      { to: '/items',    icon: <ItemsIcon />,    label: t('nav.items') },
      { to: '/requests', icon: <RequestsIcon />, label: t('nav.requests') },
    ]),
  ]

  const MORE = canManage ? [
    { to: '/items',    icon: <ItemsIcon />,    label: t('nav.items') },
    { to: '/requests', icon: <RequestsIcon />, label: t('nav.requests'), badgeCount: openRequestsCount },
    { to: '/counts', icon: <CountsIcon />, label: t('nav.counts'), badgeDot: hasCountsDraft },
    { to: '/orders', icon: <OrdersIcon />, label: t('nav.orders'), badgeCount: ordersAttentionCount },
    ...(isAdmin ? [
      { to: '/vendors',   icon: <VendorsIcon />,   label: t('nav.vendors') },
      { to: '/locations', icon: <LocationsIcon />, label: t('nav.locations') },
      { to: '/projects',  icon: <ProjectsIcon />,  label: t('nav.projects') },
      { to: '/users',     icon: <UsersIcon />,     label: t('nav.users') },
    ] : []),
    { to: '/reports',    icon: <ReportsIcon />,   label: t('nav.reports') },
  ] : []

  const moreActive  = MORE.some(item => location.pathname.startsWith(item.to))
  const moreHasBadge = MORE.some(item => item.badgeCount > 0 || item.badgeDot)

  const handleLogout = async () => {
    try { await fieldclockLogout(refreshToken) } catch {}
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-svh bg-gray-50 overflow-hidden">

      {/* ── Desktop sidebar ──────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-60 bg-brand-900 text-white shrink-0 fixed top-0 bottom-0 left-0 z-20">
        <div className="px-5 py-5 border-b border-brand-700/60 flex flex-col items-center text-center">
          <img src="/jccs-logo.jpg" alt="JCCS Services" className="h-12 w-auto"
            style={{ filter: 'invert(1)', mixBlendMode: 'screen' }} />
          <p className="text-brand-400 text-xs font-bold mt-2 tracking-widest uppercase">{t('nav.inventory')}</p>
        </div>
        <div className="px-5 py-2.5 border-b border-brand-700/40">
          <p className="text-brand-100 text-sm font-semibold">{t('home.welcome', { name: user?.name?.split(' ')[0] })}</p>
          <p className="text-brand-400/60 text-xs">{ROLE_LABELS[role] ?? role}</p>
        </div>
        <nav className="flex-1 py-3 overflow-y-auto">
          {[...PRIMARY, ...MORE].map(item => <SidebarItem key={item.to} {...item} />)}
        </nav>
        <div className="border-t border-brand-700/60">
          <div className="px-5 py-3">
            <LangSwitcher className="text-brand-400/70 hover:text-brand-100" />
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-3 px-5 py-3 text-sm text-brand-100/70 hover:text-white transition-colors w-full border-t border-brand-700/40">
            <LogoutIcon s="w-5 h-5" /> {t('nav.signOut')}
          </button>
        </div>
      </aside>

      {/* ── Content ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-60 overflow-hidden">
        <OfflineBanner />

        {/* Mobile top bar */}
        <header className="lg:hidden bg-brand-900 text-white flex items-center justify-between px-4 py-3 fixed top-0 inset-x-0 z-30">
          <img src="/jccs-logo.jpg" alt="JCCS" className="h-7 w-auto"
            style={{ filter: 'invert(1)', mixBlendMode: 'screen' }} />
          <button onClick={() => setProfileOpen(true)}
            className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-sm font-bold shrink-0 active:bg-brand-400 transition-colors">
            {user?.name?.charAt(0).toUpperCase()}
          </button>
        </header>

        <div className="lg:hidden h-[52px] shrink-0" />

        <PullToRefresh className="flex-1 px-4 pt-4 lg:p-6 w-full"
          style={{ paddingBottom: 'max(96px, calc(64px + env(safe-area-inset-bottom)))' }}
          onRefresh={() => setRefreshKey(k => k + 1)}>
          <div key={refreshKey} className="max-w-7xl mx-auto w-full">
            <Outlet />
            <div className="lg:hidden h-24 shrink-0" />
          </div>
        </PullToRefresh>

        {/* ── Mobile bottom nav ────────────────────────────── */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 flex z-40"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)', boxShadow: '0 -1px 6px rgba(0,0,0,0.06)' }}>
          {PRIMARY.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-[10px] font-semibold transition-colors ${
                  isActive ? 'text-brand-500' : 'text-gray-400'
                }`
              }>
              <span className="relative inline-flex">{item.icon}<NavBadge count={item.badgeCount} dot={item.badgeDot} /></span>
              <span>{item.label}</span>
            </NavLink>
          ))}
          {MORE.length > 0 && (
            <button onClick={() => setMoreOpen(true)}
              className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-[10px] font-semibold transition-colors ${
                moreActive ? 'text-brand-500' : 'text-gray-400'
              }`}>
              <span className="relative inline-flex"><MoreDotsIcon /><NavBadge dot={moreHasBadge} /></span>
              <span>{t('nav.more')}</span>
            </button>
          )}
        </nav>

        {/* ── More bottom sheet (specialist/admin) ────────────────── */}
        {moreOpen && (
          <div className="fixed inset-0 z-[1100] lg:hidden flex flex-col justify-end"
            onClick={() => setMoreOpen(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative bg-white rounded-t-3xl overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
              </div>
              <div className="grid grid-cols-3 gap-2 p-4">
                {MORE.map(item => (
                  <NavLink key={item.to} to={item.to} onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      `flex flex-col items-center gap-2 py-4 px-2 rounded-2xl text-xs font-semibold text-center transition-colors ${
                        isActive ? 'bg-brand-500 text-white' : 'bg-gray-50 text-gray-700 active:bg-gray-100'
                      }`
                    }>
                    <div className="relative w-8 h-8 flex items-center justify-center">{item.icon}<NavBadge count={item.badgeCount} dot={item.badgeDot} /></div>
                    <span className="leading-tight">{item.label}</span>
                  </NavLink>
                ))}
              </div>
              <div className="border-t border-gray-100 flex items-center justify-between px-5 py-3"
                style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
                <LangSwitcher className="text-gray-500" />
                <button onClick={handleLogout}
                  className="flex items-center gap-2 text-sm font-semibold text-red-500 py-2 px-3 rounded-xl active:bg-red-50 transition-colors">
                  <LogoutIcon /> {t('nav.signOut')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Profile bottom sheet ─────────────────────────── */}
        {profileOpen && (
          <div className="fixed inset-0 z-[1100] lg:hidden flex flex-col justify-end"
            onClick={() => setProfileOpen(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative bg-white rounded-t-3xl overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
              </div>
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
                <div className="w-11 h-11 rounded-full bg-brand-500 flex items-center justify-center text-white text-base font-bold shrink-0">
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{user?.name}</p>
                  <p className="text-xs text-gray-400">{ROLE_LABELS[role] ?? role}</p>
                </div>
              </div>
              <div className="px-5 py-4 flex flex-col gap-3">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium text-gray-700">{t('nav.language')}</span>
                  <LangSwitcher className="text-gray-500" />
                </div>
                <button onClick={handleLogout}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-red-50 text-red-500 text-sm font-semibold active:bg-red-100 transition-colors">
                  <LogoutIcon /> {t('nav.signOut')}
                </button>
              </div>
              <div style={{ height: 'max(12px, env(safe-area-inset-bottom))' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
