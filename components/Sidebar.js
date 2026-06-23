import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'

const LOGO_URL = 'https://cdn.phototourl.com/free/2026-06-21-c4d82306-6ffd-4d1e-badb-95ea9484d1b9.jpg'

function cleanText(value) {
  return String(value || '').trim()
}

function normalizeRole(value) {
  const role = cleanText(value).toLowerCase()

  if (role === 'master') return 'master'
  if (role === 'admin') return 'admin'
  if (role === 'agent') return 'agent'
  if (role === 'user') return 'user'

  return 'agent'
}

function canSee(item, role) {
  if (!item.roles || !item.roles.length) return true
  return item.roles.includes(role)
}

const menuGroups = [
  {
    title: 'Main',
    items: [
      {
        label: 'Dashboard',
        href: '/dashboard',
        icon: 'DB',
        roles: ['master', 'admin', 'user', 'agent']
      },
      {
        label: 'WhatsApp Blast',
        href: '/blast',
        icon: 'WB',
        roles: ['master', 'admin', 'user', 'agent']
      },
      {
        label: 'Reminder',
        href: '/reminder',
        icon: 'RM',
        roles: ['master', 'admin', 'user', 'agent']
      },
      {
        label: 'Template Blast',
        href: '/admin/template-blast',
        icon: 'TB',
        roles: ['master', 'admin', 'user', 'agent']
      },
      {
        label: 'Job Queue',
        href: '/jobs',
        icon: 'JQ',
        roles: ['master', 'admin', 'user', 'agent']
      }
    ]
  },
  {
    title: 'Monitoring',
    items: [
      {
        label: 'Logs',
        href: '/logs',
        icon: 'LG',
        roles: ['master', 'admin', 'user', 'agent']
      },
      {
        label: 'Inbox',
        href: '/inbox',
        icon: 'IN',
        roles: ['master', 'admin', 'user', 'agent']
      },
      {
        label: 'Reply Analysis',
        href: '/analysis',
        icon: 'RA',
        roles: ['master', 'admin', 'user', 'agent']
      },
      {
        label: 'Usage',
        href: '/usage',
        icon: 'US',
        roles: ['master', 'admin', 'user', 'agent']
      },
      {
        label: 'Job Performance',
        href: '/job-performance',
        icon: 'JP',
        roles: ['master', 'admin', 'user', 'agent']
      }
    ]
  },
  {
    title: 'Data',
    items: [
      {
        label: 'Import Blast',
        href: '/admin/import-blast',
        icon: 'IB',
        roles: ['master', 'admin', 'user', 'agent']
      },
      {
        label: 'Import Reminder',
        href: '/admin/import-reminder',
        icon: 'IR',
        roles: ['master', 'admin', 'user', 'agent']
      },
      {
        label: 'Database Manager',
        href: '/admin/database-manager',
        icon: 'DM',
        roles: ['master', 'admin']
      },
      {
        label: 'Blacklist',
        href: '/blacklist',
        icon: 'BL',
        roles: ['master', 'admin', 'user', 'agent']
      },
      {
        label: 'Quick Replies',
        href: '/quick-replies',
        icon: 'QR',
        roles: ['master', 'admin', 'user', 'agent']
      }
    ]
  },
  {
    title: 'Meta',
    items: [
      {
        label: 'Meta Templates',
        href: '/admin/meta-templates',
        icon: 'MT',
        roles: ['master', 'admin']
      },
      {
        label: 'Meta API Test',
        href: '/admin/meta-test',
        icon: 'MA',
        roles: ['master', 'admin']
      },
      {
        label: 'WABA Profile',
        href: '/admin/waba-profile',
        icon: 'WP',
        roles: ['master', 'admin']
      },
      {
        label: 'WhatsApp Settings',
        href: '/admin/whatsapp-settings',
        icon: 'WS',
        roles: ['master', 'admin']
      }
    ]
  },
  {
    title: 'Admin',
    items: [
      {
        label: 'Auto Worker',
        href: '/admin/auto-worker',
        icon: 'AW',
        roles: ['master', 'admin']
      },
      {
        label: 'Manage Users',
        href: '/admin/manage-users',
        icon: 'MU',
        roles: ['master', 'admin']
      },
      {
        label: 'Reset DB',
        href: '/admin/reset-db',
        icon: 'RD',
        roles: ['master']
      },
      {
        label: 'Setup Master',
        href: '/setup-master',
        icon: 'SM',
        roles: ['master']
      }
    ]
  }
]

function isActivePath(currentPath, href) {
  if (!href) return false

  if (href === '/dashboard') {
    return currentPath === '/' || currentPath === '/dashboard'
  }

  if (href === '/jobs') {
    return currentPath === '/jobs' || currentPath.startsWith('/jobs/')
  }

  return currentPath === href || currentPath.startsWith(`${href}/`)
}

function MenuLink({ href, icon, children }) {
  const router = useRouter()
  const active = isActivePath(router.pathname, href)

  return (
    <Link
      href={href}
      className={[
        'group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition',
        active
          ? 'bg-cyan-50 text-slate-950 shadow-sm ring-1 ring-cyan-100'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
      ].join(' ')}
    >
      <span
        className={[
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[10px] font-black tracking-tight transition',
          active
            ? 'bg-cyan-500 text-white'
            : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-800'
        ].join(' ')}
      >
        {icon}
      </span>
      <span className="truncate">{children}</span>
    </Link>
  )
}

export default function Sidebar(props) {
  const router = useRouter()
  const [storedRole, setStoredRole] = useState('')
  const [storedName, setStoredName] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return

    const possibleRole =
      localStorage.getItem('role') ||
      localStorage.getItem('user_role') ||
      localStorage.getItem('notiva_role') ||
      localStorage.getItem('wa_role') ||
      ''

    const possibleName =
      localStorage.getItem('name') ||
      localStorage.getItem('user_name') ||
      localStorage.getItem('notiva_name') ||
      localStorage.getItem('email') ||
      ''

    setStoredRole(possibleRole)
    setStoredName(possibleName)
  }, [])

  const role = useMemo(() => {
    return normalizeRole(
      props.role ||
      props.user?.role ||
      props.currentUser?.role ||
      storedRole
    )
  }, [props.role, props.user?.role, props.currentUser?.role, storedRole])

  const displayName = useMemo(() => {
    return cleanText(
      props.name ||
      props.user?.name ||
      props.user?.email ||
      props.currentUser?.name ||
      props.currentUser?.email ||
      storedName ||
      'Notiva User'
    )
  }, [
    props.name,
    props.user?.name,
    props.user?.email,
    props.currentUser?.name,
    props.currentUser?.email,
    storedName
  ])

  const visibleGroups = useMemo(() => {
    return menuGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => canSee(item, role))
      }))
      .filter((group) => group.items.length > 0)
  }, [role])

  async function handleLogout() {
    if (typeof props.onLogout === 'function') {
      props.onLogout()
      return
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem('token')
      localStorage.removeItem('auth_token')
      localStorage.removeItem('session')
      localStorage.removeItem('user')
      localStorage.removeItem('role')
      localStorage.removeItem('user_role')
      localStorage.removeItem('notiva_role')
      localStorage.removeItem('wa_role')
    }

    router.push('/login')
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-slate-200 bg-white/95 shadow-sm backdrop-blur xl:flex xl:flex-col">
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-100 px-5 py-5">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 shadow-sm">
              <img
                src={LOGO_URL}
                alt="Notiva"
                className="h-full w-full object-cover"
              />
            </div>

            <div className="min-w-0">
              <div className="truncate text-lg font-black tracking-tight text-slate-950">
                Notiva
              </div>
              <div className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-cyan-600">
                WA Automation
              </div>
            </div>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          <div className="space-y-6">
            {visibleGroups.map((group) => (
              <div key={group.title}>
                <div className="mb-2 px-3 text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
                  {group.title}
                </div>

                <div className="space-y-1">
                  {group.items.map((item) => (
                    <MenuLink
                      key={item.href}
                      href={item.href}
                      icon={item.icon}
                    >
                      {item.label}
                    </MenuLink>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100 p-4">
          <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-xs font-black text-white">
                {displayName.slice(0, 2).toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-black text-slate-950">
                  {displayName}
                </div>
                <div className="mt-0.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                  {role}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="mt-4 w-full rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-950 hover:text-white"
            >
              Logout
            </button>
          </div>

          <div className="mt-4 text-center text-[11px] font-semibold text-slate-400">
            Blast - Reminder - Inbox
          </div>
        </div>
      </div>
    </aside>
  )
}