New-Item -ItemType Directory -Force -Path "pages\api\databases" | Out-Null
New-Item -ItemType Directory -Force -Path "pages\api\admin" | Out-Null
New-Item -ItemType Directory -Force -Path "pages\admin" | Out-Null

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

async function countTable(table) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select('*', { count: 'exact', head: true })

  if (error) throw error

  return count || 0
}

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin'])
  if (!authUser) return

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const [
      contactDatabases,
      contacts,
      reminderLogs,
      blastLogs,
      sendJobs,
      sendJobItems,
      users
    ] = await Promise.all([
      countTable('contact_databases'),
      countTable('contacts'),
      countTable('reminder_logs'),
      countTable('blast_logs'),
      countTable('send_jobs'),
      countTable('send_job_items'),
      countTable('app_users')
    ])

    return res.status(200).json({
      success: true,
      stats: {
        contactDatabases,
        contacts,
        reminderLogs,
        blastLogs,
        totalLogs: reminderLogs + blastLogs,
        sendJobs,
        sendJobItems,
        users
      }
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal mengambil database stats'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\databases\stats.js"

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
    const { type = '' } = req.query

    let query = supabaseAdmin
      .from('contact_databases')
      .select('*')
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
      message: error.message || 'Gagal mengambil database list'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\databases\list.js"

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
    const { databaseId, page = 1, pageSize = 25 } = req.query

    if (!databaseId) {
      return res.status(400).json({
        success: false,
        message: 'databaseId wajib diisi'
      })
    }

    const safePageSize = Math.min(Math.max(Number(pageSize || 25), 1), 100)
    const safePage = Math.max(Number(page || 1), 1)
    const from = (safePage - 1) * safePageSize
    const to = from + safePageSize - 1

    const { data, error, count } = await supabaseAdmin
      .from('contacts')
      .select('*', { count: 'exact' })
      .eq('database_id', databaseId)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error

    return res.status(200).json({
      success: true,
      data: data || [],
      pagination: {
        page: safePage,
        pageSize: safePageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / safePageSize)
      }
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal mengambil contacts'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\databases\contacts.js"

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin'])
  if (!authUser) return

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const { databaseId } = req.body

    if (!databaseId) {
      return res.status(400).json({
        success: false,
        message: 'databaseId wajib diisi'
      })
    }

    const { data: database, error: dbError } = await supabaseAdmin
      .from('contact_databases')
      .select('*')
      .eq('id', databaseId)
      .maybeSingle()

    if (dbError) throw dbError

    if (!database) {
      return res.status(404).json({
        success: false,
        message: 'Database tidak ditemukan'
      })
    }

    const { error } = await supabaseAdmin
      .from('contact_databases')
      .delete()
      .eq('id', databaseId)

    if (error) throw error

    return res.status(200).json({
      success: true,
      message: `Database "${database.name}" berhasil dihapus. Contacts dan jobs terkait ikut terhapus. Logs lama tetap disimpan untuk audit.`
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal menghapus database'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\databases\delete.js"

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function isRunnerAuthorized(req) {
  const expected = process.env.JOB_RUNNER_SECRET
  const headerSecret = req.headers['x-job-runner-secret']
  const querySecret = req.query.secret

  if (!expected) return false

  return headerSecret === expected || querySecret === expected
}

function daysAgoIso(days) {
  return new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString()
}

async function deleteOldLogs(days) {
  const cutoff = daysAgoIso(days)

  const reminderResult = await supabaseAdmin
    .from('reminder_logs')
    .delete()
    .lt('sent_at', cutoff)

  if (reminderResult.error) throw reminderResult.error

  const blastResult = await supabaseAdmin
    .from('blast_logs')
    .delete()
    .lt('sent_at', cutoff)

  if (blastResult.error) throw blastResult.error

  return cutoff
}

async function deleteOldJobs(days) {
  const cutoff = daysAgoIso(days)

  const { error } = await supabaseAdmin
    .from('send_jobs')
    .delete()
    .in('status', ['done', 'failed'])
    .lt('updated_at', cutoff)

  if (error) throw error

  return cutoff
}

export default async function handler(req, res) {
  const isRunner = isRunnerAuthorized(req)

  if (!isRunner) {
    const authUser = requireRole(req, res, ['master'])
    if (!authUser) return
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const logRetentionDays =
      req.body?.logRetentionDays ||
      req.query.logRetentionDays ||
      process.env.LOG_RETENTION_DAYS ||
      90

    const jobRetentionDays =
      req.body?.jobRetentionDays ||
      req.query.jobRetentionDays ||
      process.env.JOB_RETENTION_DAYS ||
      30

    const logCutoff = await deleteOldLogs(logRetentionDays)
    const jobCutoff = await deleteOldJobs(jobRetentionDays)

    return res.status(200).json({
      success: true,
      message: `Cleanup selesai. Logs lebih lama dari ${logRetentionDays} hari dan jobs selesai lebih lama dari ${jobRetentionDays} hari dihapus.`,
      logRetentionDays: Number(logRetentionDays),
      jobRetentionDays: Number(jobRetentionDays),
      logCutoff,
      jobCutoff
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Cleanup gagal'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\admin\cleanup.js"

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function cleanPhone(phone) {
  if (!phone) return ''
  let value = String(phone).trim()
  value = value.replace(/[^\d+]/g, '')

  if (value.startsWith('0')) {
    value = '62' + value.slice(1)
  }

  if (value.startsWith('+')) {
    value = value.slice(1)
  }

  return value
}

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin'])
  if (!authUser) return

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const { databaseName, type, contacts } = req.body

    if (!databaseName || !type) {
      return res.status(400).json({
        success: false,
        message: 'databaseName dan type wajib diisi'
      })
    }

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'contacts kosong'
      })
    }

    const maxImportContacts = Number(process.env.MAX_IMPORT_CONTACTS || 5000)

    if (contacts.length > maxImportContacts) {
      return res.status(400).json({
        success: false,
        message: `Import ditolak. Maksimal ${maxImportContacts} kontak per upload. File ini berisi ${contacts.length} baris. Pecah file menjadi beberapa batch.`
      })
    }

    const seenPhones = new Set()

    const validContacts = contacts
      .map((row) => ({
        name: row.name || row.nama || '',
        phone: cleanPhone(row.phone || row.nomor || row.no_hp || row.whatsapp),
        message: row.message || row.pesan || '',
        reminder_date: row.reminder_date || row.tanggal || null,
        reminder_time: row.reminder_time || row.jam || null,
        status: 'active'
      }))
      .filter((row) => row.phone)
      .filter((row) => {
        if (seenPhones.has(row.phone)) return false
        seenPhones.add(row.phone)
        return true
      })

    if (validContacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tidak ada nomor WhatsApp valid'
      })
    }

    const { data: database, error: dbError } = await supabaseAdmin
      .from('contact_databases')
      .insert({
        name: databaseName,
        type,
        total_contacts: validContacts.length
      })
      .select()
      .single()

    if (dbError) throw dbError

    const contactsToInsert = validContacts.map((contact) => ({
      ...contact,
      database_id: database.id
    }))

    const { error: contactsError } = await supabaseAdmin
      .from('contacts')
      .insert(contactsToInsert)

    if (contactsError) throw contactsError

    return res.status(200).json({
      success: true,
      message: `Berhasil import ${validContacts.length} kontak. Duplikat nomor dalam file otomatis dilewati.`,
      database
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Import gagal'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\contacts\import.js"

@'
import { useEffect, useState } from 'react'
import AppLayout from '../../components/AppLayout'

function StatBox({ title, value, tone = 'slate' }) {
  const toneClass = {
    slate: 'border-slate-200 bg-white text-slate-900',
    indigo: 'border-indigo-100 bg-indigo-50 text-indigo-700',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    rose: 'border-rose-100 bg-rose-50 text-rose-700',
    sky: 'border-sky-100 bg-sky-50 text-sky-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700'
  }

  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${toneClass[tone] || toneClass.slate}`}>
      <p className="text-sm font-semibold opacity-75">{title}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  )
}

export default function DatabaseManagerPage() {
  const [stats, setStats] = useState(null)
  const [databases, setDatabases] = useState([])
  const [selectedDatabaseId, setSelectedDatabaseId] = useState('')
  const [contacts, setContacts] = useState([])
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [logRetentionDays, setLogRetentionDays] = useState(90)
  const [jobRetentionDays, setJobRetentionDays] = useState(30)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function loadStats() {
    const res = await fetch('/api/databases/stats')
    const json = await res.json()
    if (json.success) setStats(json.stats)
  }

  async function loadDatabases() {
    const res = await fetch('/api/databases/list')
    const json = await res.json()
    if (json.success) setDatabases(json.data || [])
  }

  async function loadContacts(nextPage = page) {
    if (!selectedDatabaseId) {
      setContacts([])
      setPagination(null)
      return
    }

    const res = await fetch(`/api/databases/contacts?databaseId=${selectedDatabaseId}&page=${nextPage}&pageSize=25`)
    const json = await res.json()

    if (json.success) {
      setContacts(json.data || [])
      setPagination(json.pagination)
      setPage(nextPage)
    }
  }

  async function deleteDatabase(databaseId) {
    const db = databases.find((item) => item.id === databaseId)

    if (!db) return

    const confirmed = confirm(
      `Yakin hapus database "${db.name}"? Contacts dan jobs terkait akan terhapus. Logs audit tetap disimpan.`
    )

    if (!confirmed) return

    setLoading(true)
    setMessage('')

    const res = await fetch('/api/databases/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ databaseId })
    })

    const json = await res.json()

    setLoading(false)
    setMessage(json.message || 'Selesai')

    if (json.success) {
      setSelectedDatabaseId('')
      setContacts([])
      await loadDatabases()
      await loadStats()
    }
  }

  async function runCleanup() {
    const confirmed = confirm(
      `Jalankan cleanup? Logs lebih lama dari ${logRetentionDays} hari dan jobs selesai lebih lama dari ${jobRetentionDays} hari akan dihapus.`
    )

    if (!confirmed) return

    setLoading(true)
    setMessage('')

    const res = await fetch('/api/admin/cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logRetentionDays, jobRetentionDays })
    })

    const json = await res.json()

    setLoading(false)
    setMessage(json.message || 'Selesai')
    await loadStats()
  }

  useEffect(() => {
    loadStats()
    loadDatabases()
  }, [])

  useEffect(() => {
    if (selectedDatabaseId) {
      loadContacts(1)
    }
  }, [selectedDatabaseId])

  const safeStats = stats || {
    contactDatabases: 0,
    contacts: 0,
    reminderLogs: 0,
    blastLogs: 0,
    totalLogs: 0,
    sendJobs: 0,
    sendJobItems: 0,
    users: 0
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Database Manager</h1>
          <p className="mt-2 text-slate-500">
            Pantau ukuran data, hapus database import tertentu, dan bersihkan logs/jobs lama supaya Supabase tetap ringan.
          </p>
        </div>

        {message && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 shadow-sm">
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          <StatBox title="Databases" value={safeStats.contactDatabases} tone="indigo" />
          <StatBox title="Contacts" value={safeStats.contacts} tone="sky" />
          <StatBox title="Logs" value={safeStats.totalLogs} tone="emerald" />
          <StatBox title="Job Items" value={safeStats.sendJobItems} tone="amber" />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">Cleanup Old Data</h2>
            <p className="mt-2 text-sm text-slate-500">
              Cleanup tidak menghapus users, settings, atau Meta API config. Hanya logs lama dan jobs selesai yang sudah melewati retention.
            </p>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700">Log Retention Days</label>
                <input
                  type="number"
                  value={logRetentionDays}
                  onChange={(e) => setLogRetentionDays(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700">Job Retention Days</label>
                <input
                  type="number"
                  value={jobRetentionDays}
                  onChange={(e) => setJobRetentionDays(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3"
                />
              </div>

              <button
                onClick={runCleanup}
                disabled={loading}
                className="mt-7 rounded-2xl bg-rose-600 px-5 py-3 font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {loading ? 'Cleaning...' : 'Run Cleanup'}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">Storage Safety Rules</h2>
            <div className="mt-5 space-y-3 text-sm text-slate-600">
              <div className="rounded-2xl bg-slate-50 p-4">
                Import dibatasi oleh <b>MAX_IMPORT_CONTACTS</b>, default 5000 kontak per upload.
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                Nomor duplikat dalam satu file otomatis dilewati.
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                Delete database akan menghapus contacts dan jobs terkait, tapi logs audit tetap disimpan sampai cleanup.
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Imported Databases</h2>
              <p className="mt-1 text-sm text-slate-500">Pilih database untuk preview kontak atau hapus database tertentu.</p>
            </div>

            <button
              onClick={() => {
                loadDatabases()
                loadStats()
              }}
              className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-3">Name</th>
                  <th>Type</th>
                  <th>Total</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {databases.map((db) => (
                  <tr key={db.id} className="border-t border-slate-100">
                    <td className="py-3 font-semibold text-slate-900">{db.name}</td>
                    <td>{db.type}</td>
                    <td>{db.total_contacts}</td>
                    <td>{new Date(db.created_at).toLocaleString()}</td>
                    <td className="space-x-2">
                      <button
                        onClick={() => setSelectedDatabaseId(db.id)}
                        className="rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => deleteDatabase(db.id)}
                        disabled={loading}
                        className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}

                {databases.length === 0 && (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-slate-400">
                      Belum ada database
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {selectedDatabaseId && (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-slate-900">Contact Preview</h2>
              {pagination && (
                <p className="text-sm text-slate-500">
                  Page {pagination.page} of {pagination.totalPages} â€” Total {pagination.total}
                </p>
              )}
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-3">Name</th>
                    <th>Phone</th>
                    <th>Reminder Date</th>
                    <th>Reminder Time</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    <tr key={contact.id} className="border-t border-slate-100">
                      <td className="py-3">{contact.name || '-'}</td>
                      <td>{contact.phone}</td>
                      <td>{contact.reminder_date || '-'}</td>
                      <td>{contact.reminder_time || '-'}</td>
                      <td className="max-w-md truncate">{contact.message || '-'}</td>
                    </tr>
                  ))}

                  {contacts.length === 0 && (
                    <tr>
                      <td colSpan="5" className="py-6 text-center text-slate-400">
                        Tidak ada kontak
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => loadContacts(Math.max(page - 1, 1))}
                  disabled={page <= 1}
                  className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => loadContacts(Math.min(page + 1, pagination.totalPages))}
                  disabled={page >= pagination.totalPages}
                  className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
'@ | Set-Content -Encoding UTF8 "pages\admin\database-manager.js"

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
  { href: '/admin/database-manager', label: 'Database Manager', roles: ['master', 'admin'] },
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
        <p className="text-sm font-medium opacity-90">Notiva</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight">
          WhatsApp Blast & Reminder
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
          Database cleanup ready.
        </p>
      </div>
    </aside>
  )
}
'@ | Set-Content -Encoding UTF8 "components\Sidebar.js"

Write-Host "Database Control Center setup selesai."
