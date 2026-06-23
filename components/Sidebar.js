import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

const LOGO_URL = 'https://cdn.phototourl.com/free/2026-06-21-c4d82306-6ffd-4d1e-badb-95ea9484d1b9.jpg'

const OPERATIONAL_MENUS = [
  {
    label: 'Home',
    href: '/',
    roles: ['master', 'admin', 'user', 'agent']
  },
  {
    label: 'Dashboard',
    href: '/dashboard',
    roles: ['master', 'admin', 'user', 'agent']
  },
  {
    label: 'Inbox',
    href: '/inbox',
    roles: ['master', 'admin', 'user', 'agent']
  },
  {
    label: 'Quick Replies',
    href: '/quick-replies',
    roles: ['master', 'admin', 'user', 'agent']
  },
  {
    label: 'Reply Analysis',
    href: '/analysis',
    roles: ['master', 'admin', 'user', 'agent']
  },
  {
    label: 'Usage Log',
    href: '/usage',
    roles: ['master', 'admin', 'user', 'agent']
  },
  {
    label: 'Blacklist',
    href: '/blacklist',
    roles: ['master', 'admin', 'user', 'agent']
  },
  {
    label: 'Reminder',
    href: '/reminder',
    roles: ['master', 'admin', 'user', 'agent']
  },
  {
    label: 'WhatsApp Blast',
    href: '/blast',
    roles: ['master', 'admin', 'user', 'agent']
  },
  {
    label: 'Template Blast',
    href: '/admin/template-blast',
    roles: ['master', 'admin', 'user', 'agent']
  },
  {
    label: 'Import Reminder',
    href: '/admin/import-reminder',
    roles: ['master', 'admin', 'user', 'agent']
  },
  {
    label: 'Import Blast',
    href: '/admin/import-blast',
    roles: ['master', 'admin', 'user', 'agent']
  },
  {
    label: 'Job Queue',
    href: '/jobs',
    roles: ['master', 'admin', 'user', 'agent']
  },
  {
    label: 'Job Performance',
    href: '/job-performance',
    roles: ['master', 'admin', 'user', 'agent']
  },
  {
    label: 'Logs',
    href: '/logs',
    roles: ['master', 'admin', 'user', 'agent']
  }
]

const ADMIN_MENUS = [
  {
    label: 'Database Manager',
    href: '/admin/database-manager',
    roles: ['master', 'admin']
  },
  {
    label: 'Auto Worker',
    href: '/admin/auto-worker',
    roles: ['master', 'admin']
  },
  {
    label: 'Meta Templates',
    href: '/admin/meta-templates',
    roles: ['master', 'admin']
  },
  {
    label: 'Meta API Test',
    href: '/admin/meta-test',
    roles: ['master', 'admin']
  },
  {
    label: 'WABA Profile',
    href: '/admin/waba-profile',
    roles: ['master', 'admin']
  },
  {
    label: 'WhatsApp Settings',
    href: '/admin/whatsapp-settings',
    roles: ['master', 'admin']
  },
  {
    label: 'Manage Users',
    href: '/admin/manage-users',
    roles: ['master', 'admin']
  },
  {
    label: 'Reset DB',
    href: '/admin/reset-db',
    roles: ['master']
  }
]

function normalizeRole(value) {
  return String(value || 'master').trim().toLowerCase()
}

function getStoredUser() {
  if (typeof window === 'undefined') {
    return null
  }

  const keys = [
    'authUser',
    'user',
    'currentUser',
    'notivaUser',
    'waUser',
    'loggedInUser'
  ]

  for (const key of keys) {
    try {
      const value = window.localStorage.getItem(key)

      if (!value) continue

      const parsed = JSON.parse(value)

      if (parsed) return parsed
    } catch (err) {
      // ignore invalid localStorage value
    }
  }

  return null
}

function getUserName(user) {
  return (
    user?.name ||
    user?.username ||
    user?.email ||
    user?.full_name ||
    user?.user_name ||
    'masteradmin'
  )
}

function getUserRole(user) {
  return normalizeRole(
    user?.role ||
    user?.user_role ||
    user?.account_role ||
    'master'
  )
}

function isActivePath(pathname, href) {
  if (href === '/') {
    return pathname === '/'
  }

  return pathname === href || pathname.startsWith(href + '/')
}

function MenuLink({ item, pathname, onClick }) {
  const active = isActivePath(pathname, item.href)

  return (
    <Link href={item.href} legacyBehavior>
      <a
        onClick={onClick}
        className={
          active
            ? 'flex items-center justify-between rounded-2xl bg-cyan-50 px-4 py-3 text-sm font-extrabold text-slate-950 ring-1 ring-cyan-200 shadow-sm'
            : 'flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }
      >
        <span>{item.label}</span>
        {active ? (
          <span className="h-2 w-2 rounded-full bg-cyan-500" />
        ) : null}
      </a>
    </Link>
  )
}

function BrandBlock() {
  return (
    <div className="mb-5 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-700 p-4">
        <div className="rounded-3xl bg-white p-3 shadow-sm">
          <img
            src={LOGO_URL}
            alt="Notiva Logo"
            className="h-24 w-full rounded-2xl object-contain"
          />
        </div>

        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-100">
            Notiva
          </p>
          <h1 className="mt-1 text-2xl font-black leading-tight text-white">
            WA Automation
          </h1>
          <p className="mt-1 text-xs font-medium text-cyan-50">
            Blast · Reminder · Inbox
          </p>
        </div>
      </div>
    </div>
  )
}

function UserCard({ userName, role }) {
  return (
    <div className="mb-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
        Logged in as
      </p>
      <p className="mt-2 truncate text-sm font-extrabold text-slate-900">
        {userName}
      </p>
      <p className="mt-1 text-xs font-bold text-indigo-600">
        {role}
      </p>
    </div>
  )
}

export default function Sidebar() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState(null)
  const [loadingUser, setLoadingUser] = useState(true)

  useEffect(() => {
    let mounted = true

    async function loadUser() {
      try {
        const endpoints = [
          '/api/auth/me',
          '/api/me',
          '/api/user/me'
        ]

        for (const endpoint of endpoints) {
          try {
            const response = await fetch(endpoint, {
              method: 'GET',
              cache: 'no-store'
            })

            if (!response.ok) continue

            const data = await response.json()
            const foundUser = data.user || data.data || data.authUser || data

            if (foundUser && mounted) {
              setUser(foundUser)
              setLoadingUser(false)
              return
            }
          } catch (err) {
            // try next endpoint
          }
        }

        const storedUser = getStoredUser()

        if (mounted) {
          setUser(storedUser || { name: 'masteradmin', role: 'master' })
          setLoadingUser(false)
        }
      } catch (err) {
        if (mounted) {
          setUser({ name: 'masteradmin', role: 'master' })
          setLoadingUser(false)
        }
      }
    }

    loadUser()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    setOpen(false)
  }, [router.pathname])

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 1024) {
        setOpen(false)
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  const userName = getUserName(user)
  const role = getUserRole(user)

  const operationalMenus = useMemo(() => {
    return OPERATIONAL_MENUS.filter((item) => item.roles.includes(role))
  }, [role])

  const adminMenus = useMemo(() => {
    return ADMIN_MENUS.filter((item) => item.roles.includes(role))
  }, [role])

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST'
      })
    } catch (err) {
      try {
        await fetch('/api/logout', {
          method: 'POST'
        })
      } catch (err2) {
        // ignore
      }
    }

    try {
      window.localStorage.removeItem('authUser')
      window.localStorage.removeItem('user')
      window.localStorage.removeItem('currentUser')
      window.localStorage.removeItem('notivaUser')
      window.localStorage.removeItem('waUser')
      window.localStorage.removeItem('loggedInUser')
    } catch (err) {
      // ignore
    }

    window.location.href = '/login'
  }

  const sidebarContent = (
    <aside className="flex h-full w-[290px] flex-col border-r border-slate-200 bg-white">
      <div className="flex-1 overflow-y-auto p-4">
        <BrandBlock />

        <UserCard
          userName={loadingUser ? 'Loading...' : userName}
          role={loadingUser ? '-' : role}
        />

        <nav className="space-y-1">
          {operationalMenus.map((item) => (
            <MenuLink
              key={item.href}
              item={item}
              pathname={router.pathname}
              onClick={() => setOpen(false)}
            />
          ))}
        </nav>

        {adminMenus.length > 0 ? (
          <div className="mt-6">
            <p className="mb-2 px-4 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
              Admin Tools
            </p>

            <nav className="space-y-1">
              {adminMenus.map((item) => (
                <MenuLink
                  key={item.href}
                  item={item}
                  pathname={router.pathname}
                  onClick={() => setOpen(false)}
                />
              ))}
            </nav>
          </div>
        ) : null}
      </div>

      <div className="border-t border-slate-200 p-4">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-red-50 hover:text-red-600"
        >
          Logout
        </button>
      </div>
    </aside>
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-50 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-900 shadow-lg lg:hidden"
      >
        Menu
      </button>

      <div className="hidden min-h-screen lg:block">
        {sidebarContent}
      </div>

      {open ? (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-slate-950/40"
          />

          <div className="absolute left-0 top-0 h-full">
            {sidebarContent}
          </div>
        </div>
      ) : null}
    </>
  )
}