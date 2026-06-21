New-Item -ItemType Directory -Force -Path "pages\api\jobs" | Out-Null
New-Item -ItemType Directory -Force -Path "pages\jobs" | Out-Null
New-Item -ItemType Directory -Force -Path "lib" | Out-Null

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin', 'user'])
  if (!authUser) return

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const { type, databaseId } = req.body

    if (!type || !['reminder', 'blast'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'type harus reminder atau blast'
      })
    }

    if (!databaseId) {
      return res.status(400).json({
        success: false,
        message: 'databaseId wajib diisi'
      })
    }

    const { data: contacts, error: contactsError } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('database_id', databaseId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })

    if (contactsError) throw contactsError

    if (!contacts || contacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Kontak kosong'
      })
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from('send_jobs')
      .insert({
        type,
        database_id: databaseId,
        status: 'pending',
        total: contacts.length,
        sent: 0,
        failed: 0
      })
      .select()
      .single()

    if (jobError) throw jobError

    const items = contacts.map((contact) => ({
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

    return res.status(200).json({
      success: true,
      message: `Job berhasil dibuat untuk ${contacts.length} kontak`,
      job
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal membuat job'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\jobs\create.js"

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin', 'user'])
  if (!authUser) return

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const { type } = req.query

    let query = supabaseAdmin
      .from('send_jobs')
      .select(`
        *,
        contact_databases (
          name,
          type,
          total_contacts
        )
      `)
      .order('created_at', { ascending: false })

    if (type) {
      query = query.eq('type', type)
    }

    const { data, error } = await query

    if (error) throw error

    return res.status(200).json({
      success: true,
      data: data || []
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal mengambil job'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\jobs\list.js"

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { sendWhatsAppText, sendWhatsAppTemplate } from '../../../lib/metaWhatsapp'
import { requireRole } from '../../../lib/auth'
import { sleep, getSendDelayMs } from '../../../lib/rateLimit'

function getValue(contact, field) {
  const value = contact?.[field]
  if (value === null || value === undefined) return ''
  return String(value)
}

function interpolateMessage(template, contact) {
  if (!template) return ''

  return template
    .replaceAll('{name}', getValue(contact, 'name'))
    .replaceAll('{phone}', getValue(contact, 'phone'))
    .replaceAll('{message}', getValue(contact, 'message'))
    .replaceAll('{reminder_date}', getValue(contact, 'reminder_date'))
    .replaceAll('{reminder_time}', getValue(contact, 'reminder_time'))
}

async function getSetting(type) {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_settings')
    .select('*')
    .eq('type', type)
    .maybeSingle()

  if (error) throw error

  if (type === 'reminder') {
    return data || {
      message_mode: 'text',
      template_variables: [],
      default_message: 'Halo {name}, ini reminder untuk jadwal Anda pada {reminder_date} pukul {reminder_time}.'
    }
  }

  return data || {
    message_mode: 'text',
    template_variables: [],
    default_message: 'Halo {name}, ini informasi terbaru dari layanan kami.'
  }
}

async function updateJobCounter(jobId) {
  const { data: items, error } = await supabaseAdmin
    .from('send_job_items')
    .select('status')
    .eq('job_id', jobId)

  if (error) throw error

  const total = items.length
  const sent = items.filter((item) => item.status === 'sent').length
  const failed = items.filter((item) => item.status === 'failed').length
  const pending = items.filter((item) => item.status === 'pending').length

  const status = pending === 0 ? 'done' : 'pending'

  await supabaseAdmin
    .from('send_jobs')
    .update({
      total,
      sent,
      failed,
      status,
      updated_at: new Date().toISOString()
    })
    .eq('id', jobId)

  return { total, sent, failed, pending, status }
}

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin', 'user'])
  if (!authUser) return

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const { jobId, limit } = req.body

    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: 'jobId wajib diisi'
      })
    }

    const batchLimit = Math.min(Math.max(Number(limit || 10), 1), 50)
    const delayMs = getSendDelayMs()

    const { data: job, error: jobError } = await supabaseAdmin
      .from('send_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError) throw jobError

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job tidak ditemukan'
      })
    }

    if (job.status === 'done') {
      return res.status(200).json({
        success: true,
        message: 'Job sudah selesai',
        processed: 0
      })
    }

    await supabaseAdmin
      .from('send_jobs')
      .update({
        status: 'processing',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId)

    const { data: items, error: itemsError } = await supabaseAdmin
      .from('send_job_items')
      .select(`
        *,
        contacts (*)
      `)
      .eq('job_id', jobId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(batchLimit)

    if (itemsError) throw itemsError

    if (!items || items.length === 0) {
      const counters = await updateJobCounter(jobId)

      return res.status(200).json({
        success: true,
        message: 'Tidak ada item pending',
        processed: 0,
        counters
      })
    }

    const setting = await getSetting(job.type)

    let processed = 0
    let sent = 0
    let failed = 0

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const contact = item.contacts || {}

      let result
      let message = item.message || contact.message || interpolateMessage(setting.default_message, contact)

      if (setting.message_mode === 'template') {
        const variables = Array.isArray(setting.template_variables)
          ? setting.template_variables.map((field) => getValue(contact, field))
          : []

        result = await sendWhatsAppTemplate({
          phone: item.phone,
          templateName: setting.template_name,
          languageCode: setting.language_code || 'id',
          variables
        })

        message = `TEMPLATE: ${setting.template_name} | VARS: ${variables.join(', ')}`
      } else {
        result = await sendWhatsAppText({
          phone: item.phone,
          message
        })
      }

      const status = result.ok ? 'sent' : 'failed'

      if (result.ok) sent += 1
      else failed += 1

      await supabaseAdmin
        .from('send_job_items')
        .update({
          status,
          meta_message_id: result.messageId || null,
          error_message: result.error || null,
          processed_at: new Date().toISOString()
        })
        .eq('id', item.id)

      const logTable = job.type === 'reminder' ? 'reminder_logs' : 'blast_logs'

      await supabaseAdmin.from(logTable).insert({
        database_id: job.database_id,
        contact_id: item.contact_id,
        phone: item.phone,
        message,
        status,
        meta_message_id: result.messageId || null,
        error_message: result.error || null
      })

      processed += 1

      if (i < items.length - 1) {
        await sleep(delayMs)
      }
    }

    const counters = await updateJobCounter(jobId)

    return res.status(200).json({
      success: true,
      message: `Batch selesai. Diproses: ${processed}, Terkirim: ${sent}, Gagal: ${failed}, Pending: ${counters.pending}`,
      processed,
      sent,
      failed,
      delayMs,
      counters
    })
  } catch (error) {
    await supabaseAdmin
      .from('send_jobs')
      .update({
        status: 'failed',
        updated_at: new Date().toISOString()
      })
      .eq('id', req.body?.jobId || '00000000-0000-0000-0000-000000000000')

    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memproses job'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\jobs\process.js"

@'
import { useEffect, useState } from 'react'
import AppLayout from '../../components/AppLayout'

export default function JobsPage() {
  const [type, setType] = useState('blast')
  const [databases, setDatabases] = useState([])
  const [databaseId, setDatabaseId] = useState('')
  const [jobs, setJobs] = useState([])
  const [selectedJobId, setSelectedJobId] = useState('')
  const [limit, setLimit] = useState(10)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function loadDatabases(nextType = type) {
    const res = await fetch(`/api/contacts/list?type=${nextType}`)
    const json = await res.json()
    setDatabases(json.data || [])
  }

  async function loadJobs(nextType = type) {
    const res = await fetch(`/api/jobs/list?type=${nextType}`)
    const json = await res.json()
    setJobs(json.data || [])
  }

  async function createJob() {
    if (!databaseId) {
      alert('Pilih database dulu')
      return
    }

    setLoading(true)
    setMessage('Membuat job...')

    const res = await fetch('/api/jobs/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, databaseId })
    })

    const json = await res.json()
    setLoading(false)
    setMessage(json.message || 'Selesai')

    if (json.success) {
      setSelectedJobId(json.job.id)
      loadJobs()
    }
  }

  async function processBatch(jobId = selectedJobId) {
    if (!jobId) {
      alert('Pilih job dulu')
      return
    }

    setLoading(true)
    setMessage('Memproses batch...')

    const res = await fetch('/api/jobs/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, limit })
    })

    const json = await res.json()
    setLoading(false)
    setMessage(json.message || 'Selesai')
    loadJobs()
  }

  function changeType(nextType) {
    setType(nextType)
    setDatabaseId('')
    setSelectedJobId('')
    loadDatabases(nextType)
    loadJobs(nextType)
  }

  useEffect(() => {
    loadDatabases()
    loadJobs()
  }, [])

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Job Queue</h1>
          <p className="mt-2 text-slate-500">
            Buat job pengiriman dan proses batch supaya tidak terlalu berat.
          </p>
        </div>

        {message && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 shadow-sm">
            {message}
          </div>
        )}

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Create Job</h2>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
            <select
              value={type}
              onChange={(e) => changeType(e.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3"
            >
              <option value="reminder">Reminder</option>
              <option value="blast">WhatsApp Blast</option>
            </select>

            <select
              value={databaseId}
              onChange={(e) => setDatabaseId(e.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3 md:col-span-2"
            >
              <option value="">-- Pilih Database --</option>
              {databases.map((db) => (
                <option key={db.id} value={db.id}>
                  {db.name} - {db.total_contacts} kontak
                </option>
              ))}
            </select>

            <button
              onClick={createJob}
              disabled={loading}
              className="rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              Create Job
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Process Batch</h2>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3 md:col-span-2"
            >
              <option value="">-- Pilih Job --</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.contact_databases?.name || job.id} | {job.status} | {job.sent}/{job.total} sent | failed {job.failed}
                </option>
              ))}
            </select>

            <input
              type="number"
              min="1"
              max="50"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3"
            />

            <button
              onClick={() => processBatch()}
              disabled={loading}
              className="rounded-2xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              Process Batch
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-900">Job List</h2>
            <button
              onClick={() => loadJobs()}
              className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-3">Created</th>
                  <th>Database</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Sent</th>
                  <th>Failed</th>
                  <th>Pending</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const pending = Math.max((job.total || 0) - (job.sent || 0) - (job.failed || 0), 0)

                  return (
                    <tr key={job.id} className="border-t border-slate-100">
                      <td className="py-3">{new Date(job.created_at).toLocaleString()}</td>
                      <td>{job.contact_databases?.name || '-'}</td>
                      <td>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                          {job.status}
                        </span>
                      </td>
                      <td>{job.total}</td>
                      <td className="text-emerald-700">{job.sent}</td>
                      <td className="text-rose-700">{job.failed}</td>
                      <td>{pending}</td>
                      <td>
                        <button
                          onClick={() => {
                            setSelectedJobId(job.id)
                            processBatch(job.id)
                          }}
                          disabled={loading || job.status === 'done'}
                          className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          Process
                        </button>
                      </td>
                    </tr>
                  )
                })}

                {jobs.length === 0 && (
                  <tr>
                    <td colSpan="8" className="py-6 text-center text-slate-400">
                      Belum ada job
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
'@ | Set-Content -Encoding UTF8 "pages\jobs\index.js"

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
        <p className="text-sm font-medium opacity-90">Notiva</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight">WhatsApp Blast & Reminder</h1>
      </div>

      <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Logged in as</p>
        <p className="mt-1 text-sm font-bold text-slate-800">{user?.username || 'User'}</p>
        <p className="text-xs font-semibold text-indigo-600">{role}</p>
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

Write-Host "Job queue setup selesai."
