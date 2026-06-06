New-Item -ItemType Directory -Force -Path "pages\admin" | Out-Null

@'
import { useState } from 'react'
import AppLayout from '../../components/AppLayout'

export default function AutoWorkerPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  async function runScheduler() {
    setLoading(true)
    setResult(null)

    const res = await fetch('/api/scheduler/create-due-reminder-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 50 })
    })

    const json = await res.json()
    setLoading(false)
    setResult(json)
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Auto Worker</h1>
          <p className="mt-2 text-slate-500">
            Sistem otomatis untuk membuat job reminder yang sudah waktunya dan memproses antrean pengiriman.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">Reminder Scheduler</h2>
            <p className="mt-2 text-sm text-slate-500">
              Mengecek kontak reminder berdasarkan tanggal dan jam, lalu membuat job otomatis jika sudah due.
            </p>

            <button
              onClick={runScheduler}
              disabled={loading}
              className="mt-5 rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading ? 'Checking...' : 'Run Manual Check'}
            </button>

            {result && (
              <div className={result.success ? 'mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800' : 'mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800'}>
                <p className="font-bold">{result.message}</p>
                {result.localNow && (
                  <p className="mt-2 text-sm">
                    Worker time: {result.localNow.date} {result.localNow.time}
                  </p>
                )}
                {result.job && (
                  <p className="mt-2 text-sm">
                    Job ID: {result.job.id}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">Background Processing</h2>
            <p className="mt-2 text-sm text-slate-500">
              Auto Worker akan memproses Job Queue secara batch, memberi jeda antar nomor, dan mencatat hasil ke logs.
            </p>

            <div className="mt-5 space-y-3 rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">
              <div className="flex justify-between">
                <span>Status</span>
                <span className="font-bold text-emerald-600">Ready</span>
              </div>
              <div className="flex justify-between">
                <span>Mode</span>
                <span className="font-bold text-slate-800">Batch Processing</span>
              </div>
              <div className="flex justify-between">
                <span>Purpose</span>
                <span className="font-bold text-slate-800">Reminder & Broadcast</span>
              </div>
            </div>

            <p className="mt-5 text-xs text-slate-400">
              Catatan: service background bisa dijalankan di server worker eksternal, tapi nama yang tampil di aplikasi adalah Auto Worker.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
'@ | Set-Content -Encoding UTF8 "pages\admin\auto-worker.js"

@'
import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function SchedulerRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/admin/auto-worker')
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="rounded-3xl border border-slate-200 bg-white px-6 py-4 text-sm font-semibold text-slate-600 shadow-sm">
        Redirecting to Auto Worker...
      </div>
    </main>
  )
}
'@ | Set-Content -Encoding UTF8 "pages\admin\scheduler.js"

@'
import Link from 'next/link'
import { useRouter } from 'next/router'

const navItems = [
  { href: '/', label: 'Home', roles: ['master', 'admin', 'user'] },
  { href: '/dashboard', label: 'Dashboard', roles: ['master', 'admin', 'user'] },
  { href: '/reminder', label: 'Reminder', roles: ['master', 'admin', 'user'] },
  { href: '/blast', label: 'WhatsApp Blast', roles: ['master', 'admin', 'user'] },
  { href: '/jobs', label: 'Job Queue', roles: ['master', 'admin', 'user'] },
  { href: '/logs', label: 'Logs', roles: ['master', 'admin', 'user'] },

  { href: '/admin/import-reminder', label: 'Import Reminder', roles: ['master', 'admin'] },
  { href: '/admin/import-blast', label: 'Import Blast', roles: ['master', 'admin'] },
  { href: '/admin/auto-worker', label: 'Auto Worker', roles: ['master', 'admin'] },
  { href: '/admin/meta-test', label: 'Meta API Test', roles: ['master', 'admin'] },
  { href: '/admin/whatsapp-settings', label: 'WhatsApp Settings', roles: ['master', 'admin'] },
  { href: '/admin/manage-users', label: 'Manage Users', roles: ['master', 'admin'] },
  { href: '/admin/reset-db', label: 'Reset DB', roles: ['master'] }
]

export default function Sidebar({ user }) {
  const router = useRouter()
  const role = user?.role || 'user'

  const visibleItems = navItems.filter((item) => item.roles.includes(role))

  return (
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
          {user?.username || 'User'}
        </p>
        <p className="text-xs font-semibold text-indigo-600">
          {role}
        </p>
      </div>

      <nav className="mt-6 space-y-1">
        {visibleItems.map((item) => {
          const active = router.pathname === item.href

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
          Auto Worker ready.
        </p>
      </div>
    </aside>
  )
}
'@ | Set-Content -Encoding UTF8 "components\Sidebar.js"

if (Test-Path "huggingface-runner\index.js") {
  (Get-Content "huggingface-runner\index.js" -Raw) `
    -replace "WA Reminder Blast Runner", "WA Reminder Blast Auto Worker" `
    -replace "Runner started", "Auto Worker started" `
    -replace "runner", "worker" |
    Set-Content -Encoding UTF8 "huggingface-runner\index.js"
}

if (Test-Path "huggingface-runner\README.md") {
@'
# WA Reminder Blast Auto Worker

Auto Worker adalah service background untuk menjalankan:

- Auto Reminder Scheduler
- Job Queue Processor
- Batch WhatsApp Sender

## Environment Variables

APP_URL=https://your-vercel-app.vercel.app
JOB_RUNNER_SECRET=same_secret_as_next_app
INTERVAL_MS=15000
JOB_BATCH_LIMIT=10
JOB_TYPE=

JOB_TYPE can be empty, reminder, or blast.
'@ | Set-Content -Encoding UTF8 "huggingface-runner\README.md"
}

Write-Host "Rename to Auto Worker selesai."