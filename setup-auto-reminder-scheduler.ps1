New-Item -ItemType Directory -Force -Path "pages\api\scheduler" | Out-Null
New-Item -ItemType Directory -Force -Path "pages\admin" | Out-Null

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function getLocalNow() {
  const offsetHours = Number(process.env.APP_TIMEZONE_OFFSET_HOURS || 7)
  const now = new Date()
  const local = new Date(now.getTime() + offsetHours * 60 * 60 * 1000)

  const yyyy = local.getUTCFullYear()
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(local.getUTCDate()).padStart(2, '0')
  const hh = String(local.getUTCHours()).padStart(2, '0')
  const mi = String(local.getUTCMinutes()).padStart(2, '0')

  return {
    date: `${yyyy}-${mm}-${dd}`,
    time: `${hh}:${mi}`,
    iso: local.toISOString()
  }
}

function isDue(contact, localNow) {
  if (!contact.reminder_date) return false

  const date = contact.reminder_date
  const time = contact.reminder_time ? String(contact.reminder_time).slice(0, 5) : '00:00'

  if (date < localNow.date) return true
  if (date === localNow.date && time <= localNow.time) return true

  return false
}

async function createReminderJobForDueContacts({ limit = 50 } = {}) {
  const localNow = getLocalNow()
  const batchLimit = Math.min(Math.max(Number(limit || 50), 1), 200)

  const { data: reminderDbs, error: dbError } = await supabaseAdmin
    .from('contact_databases')
    .select('id, name')
    .eq('type', 'reminder')

  if (dbError) throw dbError

  const reminderDbIds = (reminderDbs || []).map((db) => db.id)

  if (reminderDbIds.length === 0) {
    return {
      success: true,
      message: 'Tidak ada database reminder',
      created: false,
      localNow
    }
  }

  const { data: contacts, error: contactsError } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .in('database_id', reminderDbIds)
    .eq('status', 'active')
    .not('reminder_date', 'is', null)
    .order('reminder_date', { ascending: true })
    .order('reminder_time', { ascending: true })
    .limit(1000)

  if (contactsError) throw contactsError

  const dueContactsRaw = (contacts || []).filter((contact) => isDue(contact, localNow))

  if (dueContactsRaw.length === 0) {
    return {
      success: true,
      message: 'Belum ada reminder yang due',
      created: false,
      due: 0,
      localNow
    }
  }

  const contactIds = dueContactsRaw.map((contact) => contact.id)

  const { data: locks, error: locksError } = await supabaseAdmin
    .from('reminder_dispatch_locks')
    .select('contact_id')
    .in('contact_id', contactIds)

  if (locksError) throw locksError

  const lockedIds = new Set((locks || []).map((lock) => lock.contact_id))

  const dueContacts = dueContactsRaw
    .filter((contact) => !lockedIds.has(contact.id))
    .slice(0, batchLimit)

  if (dueContacts.length === 0) {
    return {
      success: true,
      message: 'Semua reminder due sudah pernah dibuatkan job',
      created: false,
      due: dueContactsRaw.length,
      localNow
    }
  }

  const databaseId = dueContacts[0].database_id

  const { data: job, error: jobError } = await supabaseAdmin
    .from('send_jobs')
    .insert({
      type: 'reminder',
      database_id: databaseId,
      status: 'pending',
      total: dueContacts.length,
      sent: 0,
      failed: 0
    })
    .select()
    .single()

  if (jobError) throw jobError

  const items = dueContacts.map((contact) => ({
    job_id: job.id,
    contact_id: contact.id,
    phone: contact.phone,
    message: contact.message || null,
    status: 'pending'
  }))

  const { error: itemsError } = await supabaseAdmin
    .from('send_job_items')
    .insert(items)

  if (itemsError) throw itemsError

  const locksToInsert = dueContacts.map((contact) => ({
    contact_id: contact.id,
    database_id: contact.database_id,
    reminder_date: contact.reminder_date,
    reminder_time: contact.reminder_time,
    job_id: job.id
  }))

  const { error: lockInsertError } = await supabaseAdmin
    .from('reminder_dispatch_locks')
    .insert(locksToInsert)

  if (lockInsertError) throw lockInsertError

  return {
    success: true,
    message: `Auto reminder job dibuat untuk ${dueContacts.length} kontak`,
    created: true,
    job,
    due: dueContacts.length,
    localNow
  }
}

function isRunnerAuthorized(req) {
  const expected = process.env.JOB_RUNNER_SECRET
  const headerSecret = req.headers['x-job-runner-secret']
  const querySecret = req.query.secret

  if (!expected) return false

  return headerSecret === expected || querySecret === expected
}

export default async function handler(req, res) {
  const isManualAdmin = req.method === 'POST' && req.headers.cookie
  const isRunner = isRunnerAuthorized(req)

  if (!isRunner && isManualAdmin) {
    const authUser = requireRole(req, res, ['master', 'admin'])
    if (!authUser) return
  }

  if (!isRunner && !isManualAdmin) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized scheduler'
    })
  }

  try {
    const limit =
      req.query.limit ||
      req.body?.limit ||
      process.env.AUTO_REMINDER_BATCH_SIZE ||
      50

    const result = await createReminderJobForDueContacts({ limit })

    return res.status(200).json({
      ...result,
      scheduler: true
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Scheduler gagal',
      scheduler: true
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\scheduler\create-due-reminder-job.js"

@'
import { useState } from 'react'
import AppLayout from '../../components/AppLayout'

export default function SchedulerPage() {
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
          <h1 className="text-3xl font-bold text-slate-900">Auto Reminder Scheduler</h1>
          <p className="mt-2 text-slate-500">
            Buat job otomatis untuk kontak reminder yang sudah mencapai tanggal dan jam.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Manual Trigger</h2>
          <p className="mt-2 text-sm text-slate-500">
            Tombol ini berguna untuk test. Di production, Hugging Face Runner bisa memanggil endpoint ini otomatis.
          </p>

          <button
            onClick={runScheduler}
            disabled={loading}
            className="mt-5 rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? 'Checking...' : 'Create Due Reminder Job'}
          </button>

          {result && (
            <div className={result.success ? 'mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800' : 'mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800'}>
              <p className="font-bold">{result.message}</p>
              {result.localNow && (
                <p className="mt-2 text-sm">
                  Local scheduler time: {result.localNow.date} {result.localNow.time}
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
      </div>
    </AppLayout>
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
  { href: '/admin/scheduler', label: 'Scheduler', roles: ['master', 'admin'] },
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
          API protected by login session.
        </p>
      </div>
    </aside>
  )
}
'@ | Set-Content -Encoding UTF8 "components\Sidebar.js"

Write-Host "Auto reminder scheduler setup selesai."