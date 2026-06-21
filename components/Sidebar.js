import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

const navItems = [
  { href: '/', label: 'Home', roles: ['master', 'admin', 'user', 'agent'] },
  { href: '/dashboard', label: 'Dashboard', roles: ['master', 'admin', 'user', 'agent'] },

  { href: '/inbox', label: 'Inbox', roles: ['master', 'admin', 'user', 'agent'] },
  { href: '/quick-replies', label: 'Quick Replies', roles: ['master', 'admin', 'user', 'agent'] },
  { href: '/analysis', label: 'Reply Analysis', roles: ['master', 'admin', 'user', 'agent'] },
  { href: '/usage', label: 'Usage Log', roles: ['master', 'admin', 'user', 'agent'] },
  { href: '/blacklist', label: 'Blacklist', roles: ['master', 'admin', 'user', 'agent'] },

  { href: '/reminder', label: 'Reminder', roles: ['master', 'admin', 'user', 'agent'] },
  { href: '/blast', label: 'WhatsApp Blast', roles: ['master', 'admin', 'user', 'agent'] },
  { href: '/admin/import-reminder', label: 'Import Reminder', roles: ['master', 'admin', 'agent'] },
  { href: '/admin/import-blast', label: 'Import Blast', roles: ['master', 'admin', 'agent'] },
  { href: '/jobs', label: 'Job Queue', roles: ['master', 'admin', 'user', 'agent'] },
  { href: '/job-performance', label: 'Job Performance', roles: ['master', 'admin', 'user', 'agent'] },
  { href: '/logs', label: 'Logs', roles: ['master', 'admin', 'user', 'agent'] },

  { href: '/admin/database-manager', label: 'Database Manager', roles: ['master', 'admin'] },
  { href: '/admin/auto-worker', label: 'Auto Worker', roles: ['master', 'admin'] },
  { href: '/admin/meta-test', label: 'Meta API Test', roles: ['master', 'admin'] },
  { href: '/admin/waba-profile', label: 'WABA Profile', roles: ['master', 'admin'] },
  { href: '/admin/whatsapp-settings', label: 'WhatsApp Settings', roles: ['master', 'admin'] },
  { href: '/admin/manage-users', label: 'Manage Users', roles: ['master', 'admin'] },
  { href: '/admin/reset-db', label: 'Reset DB', roles: ['master'] }
]

export default function Sidebar({ user }) {
  const router = useRouter()
  const [loadedUser, setLoadedUser] = useState(user || null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [hideMobileButton, setHideMobileButton] = useState(false)

  const role = user?.role || loadedUser?.role || 'user'
  const username = user?.username || loadedUser?.username || 'User'

  const visibleItems = navItems.filter((item) => item.roles.includes(role))

  async function loadMe() {
    if (user?.role) return

    try {
      const response = await fetch('/api/auth/me?t=' + Date.now(), {
        cache: 'no-store'
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setLoadedUser(data.user)
      }
    } catch (err) {
      console.error('Failed to load sidebar user:', err)
    }
  }

  function isActive(item) {
    if (item.href === '/') {
      return router.pathname === '/'
    }

    return router.pathname === item.href || router.pathname.startsWith(item.href + '/')
  }

  useEffect(() => {
    loadMe()
  }, [user?.role])

  useEffect(() => {
    setMobileOpen(false)
  }, [router.pathname])

  useEffect(() => {
    let lastScrollY = window.scrollY
    let timer = null

    function handleScroll() {
      const current = window.scrollY
      const scrollingDown = current > lastScrollY + 8

      if (scrollingDown) {
        setHideMobileButton(true)

        if (timer) clearTimeout(timer)
        timer = setTimeout(() => setHideMobileButton(false), 1200)
      }

      lastScrollY = current
    }

    function handleFocusIn(event) {
      const tag = event.target?.tagName?.toLowerCase()
      if (['input', 'textarea', 'select'].includes(tag)) {
        setHideMobileButton(true)
      }
    }

    function handleFocusOut() {
      setTimeout(() => setHideMobileButton(false), 250)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)

    return () => {
      window.removeEventListener('scroll', handleScroll)
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
      if (timer) clearTimeout(timer)
    }
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className={`fixed bottom-5 left-4 z-50 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-xl shadow-slate-300 transition-all duration-300 lg:hidden ${
          hideMobileButton
            ? '-translate-x-[120%] opacity-0 pointer-events-none'
            : 'translate-x-0 opacity-100'
        }`}
      >
        <span className="text-lg leading-none">☰</span>
        Menu
      </button>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-900/45"
          />

          <aside className="absolute left-0 top-0 flex h-full w-[82vw] max-w-xs flex-col bg-white shadow-2xl">
            <div className="shrink-0 border-b border-slate-100 p-4">
              <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-sky-500 p-5 text-white shadow-lg shadow-indigo-100">
                <p className="text-sm font-medium opacity-90">Harmony Health</p>
                <h1 className="mt-1 text-2xl font-bold leading-tight">
                  WA Reminder & Blast
                </h1>
              </div>

              <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Logged in as
                </p>

                <p className="mt-1 text-sm font-bold text-slate-800">
                  {username}
                </p>

                <p className="text-xs font-semibold text-indigo-600">
                  {role}
                </p>
              </div>
            </div>

            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4 pb-28">
              {visibleItems.map((item) => {
                const active = isActive(item)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      active
                        ? 'block rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700'
                        : 'block rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>

            <div className="shrink-0 border-t border-slate-100 p-4">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
              >
                Tutup Menu
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      <aside className="hidden min-h-screen w-72 shrink-0 border-r border-slate-200 bg-white px-5 py-6 lg:block">
        <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-sky-500 p-5 text-white shadow-lg shadow-indigo-100">
          <p className="text-sm font-medium opacity-90">Harmony Health</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">
            WA Reminder & Blast
          </h1>
        </div>

        <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Logged in as
          </p>

          <p className="mt-1 text-sm font-bold text-slate-800">
            {username}
          </p>

          <p className="text-xs font-semibold text-indigo-600">
            {role}
          </p>
        </div>

        <nav className="mt-6 space-y-1">
          {visibleItems.map((item) => {
            const active = isActive(item)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? 'block rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700'
                    : 'block rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="mt-6 rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-sm font-bold text-emerald-700">System Online</p>

          <p className="mt-1 text-xs text-emerald-600">
            {role === 'agent'
              ? 'Agent access: Inbox, Quick Replies, Reply Analysis, Usage Log, Blacklist, Reminder, Blast, Import Data, Jobs, and Logs.'
              : 'Admin access: full operational dashboard, WABA Profile, inbox, analytics, import data, and system settings.'}
          </p>
        </div>
      </aside>
    </>
  )
}