import Link from 'next/link'
import { useRouter } from 'next/router'

const navItems = [
  { href: '/', label: 'Home', icon: '⌂' },
  { href: '/dashboard', label: 'Dashboard', icon: '▣' },
  { href: '/reminder', label: 'Reminder', icon: '◴' },
  { href: '/blast', label: 'WhatsApp Blast', icon: '✦' },
  { href: '/admin/import-reminder', label: 'Import Reminder', icon: '↥' },
  { href: '/admin/import-blast', label: 'Import Blast', icon: '↟' },
  { href: '/admin/manage-users', label: 'Manage Users', icon: '◉' },
  { href: '/admin/reset-db', label: 'Reset Database', icon: '♻' },
  { href: '/logs', label: 'Logs', icon: '☰' },
]

export default function Sidebar() {
  const router = useRouter()

  return (
    <aside className="hidden w-[280px] shrink-0 border-r border-[#e7ecf5] bg-white/90 p-5 shadow-[18px_0_45px_rgba(50,64,99,0.05)] backdrop-blur-xl lg:block">
      <Link href="/" className="mb-8 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6d5dfc] to-[#12b8a6] text-xl font-bold text-white shadow-lg shadow-indigo-200">
          +
        </div>
        <div>
          <div className="text-base font-bold tracking-tight text-[#172033]">Harmony WA</div>
          <div className="text-xs font-medium text-[#718096]">Reminder & Blast</div>
        </div>
      </Link>

      <nav className="space-y-1.5">
        {navItems.map((item) => {
          const isActive = item.href === '/'
            ? router.pathname === '/'
            : router.pathname === item.href || router.pathname.startsWith(item.href + '/')

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold transition',
                isActive
                  ? 'bg-[#eeeefe] text-[#5847ee] shadow-sm'
                  : 'text-[#667085] hover:bg-[#f6f8fc] hover:text-[#172033]'
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-8 w-8 items-center justify-center rounded-xl text-sm transition',
                  isActive
                    ? 'bg-white text-[#5847ee] shadow-sm'
                    : 'bg-[#f8fafc] text-[#98a2b3] group-hover:text-[#172033]'
                ].join(' ')}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="mt-8 rounded-3xl border border-[#dff7f3] bg-[#e9fbf8] p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[#0f766e]">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white">✓</span>
          Sistem Aman
        </div>
        <p className="text-xs leading-5 text-[#4f6f6b]">
          Mode official Meta API, siap untuk integrasi Supabase dan WhatsApp Cloud API.
        </p>
      </div>
    </aside>
  )
}
