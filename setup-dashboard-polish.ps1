New-Item -ItemType Directory -Force -Path "pages\api\dashboard" | Out-Null
New-Item -ItemType Directory -Force -Path "pages\dashboard" | Out-Null

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function applyDateFilter(query, column, start, end) {
  let nextQuery = query

  if (start) {
    nextQuery = nextQuery.gte(column, `${start}T00:00:00`)
  }

  if (end) {
    nextQuery = nextQuery.lte(column, `${end}T23:59:59`)
  }

  return nextQuery
}

function countStatus(rows, status) {
  return (rows || []).filter((item) => item.status === status).length
}

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
    const { start = '', end = '' } = req.query

    const [
      databasesResult,
      contactsResult,
      reminderLogsResult,
      blastLogsResult,
      jobsResult
    ] = await Promise.all([
      supabaseAdmin
        .from('contact_databases')
        .select('*')
        .order('created_at', { ascending: false }),

      supabaseAdmin
        .from('contacts')
        .select('*'),

      applyDateFilter(
        supabaseAdmin
          .from('reminder_logs')
          .select('*')
          .order('sent_at', { ascending: false }),
        'sent_at',
        start,
        end
      ),

      applyDateFilter(
        supabaseAdmin
          .from('blast_logs')
          .select('*')
          .order('sent_at', { ascending: false }),
        'sent_at',
        start,
        end
      ),

      supabaseAdmin
        .from('send_jobs')
        .select(`
          *,
          contact_databases (
            name,
            type
          )
        `)
        .order('created_at', { ascending: false })
        .limit(10)
    ])

    if (databasesResult.error) throw databasesResult.error
    if (contactsResult.error) throw contactsResult.error
    if (reminderLogsResult.error) throw reminderLogsResult.error
    if (blastLogsResult.error) throw blastLogsResult.error
    if (jobsResult.error) throw jobsResult.error

    const databases = databasesResult.data || []
    const contacts = contactsResult.data || []
    const reminderLogs = reminderLogsResult.data || []
    const blastLogs = blastLogsResult.data || []
    const jobs = jobsResult.data || []

    const reminderSent = countStatus(reminderLogs, 'sent')
    const reminderFailed = countStatus(reminderLogs, 'failed')
    const blastSent = countStatus(blastLogs, 'sent')
    const blastFailed = countStatus(blastLogs, 'failed')

    const allJobsResult = await supabaseAdmin
      .from('send_jobs')
      .select('*')

    if (allJobsResult.error) throw allJobsResult.error

    const allJobs = allJobsResult.data || []

    const summary = {
      totalDatabases: databases.length,
      totalReminderDatabases: databases.filter((item) => item.type === 'reminder').length,
      totalBlastDatabases: databases.filter((item) => item.type === 'blast').length,

      totalContacts: contacts.length,
      totalReminderContacts: contacts.filter((item) => {
        const db = databases.find((database) => database.id === item.database_id)
        return db?.type === 'reminder'
      }).length,
      totalBlastContacts: contacts.filter((item) => {
        const db = databases.find((database) => database.id === item.database_id)
        return db?.type === 'blast'
      }).length,

      reminderSent,
      reminderFailed,
      reminderTotal: reminderLogs.length,

      blastSent,
      blastFailed,
      blastTotal: blastLogs.length,

      totalSent: reminderSent + blastSent,
      totalFailed: reminderFailed + blastFailed,
      totalLogs: reminderLogs.length + blastLogs.length,

      totalJobs: allJobs.length,
      pendingJobs: allJobs.filter((job) => job.status === 'pending').length,
      processingJobs: allJobs.filter((job) => job.status === 'processing').length,
      doneJobs: allJobs.filter((job) => job.status === 'done').length,
      failedJobs: allJobs.filter((job) => job.status === 'failed').length
    }

    return res.status(200).json({
      success: true,
      summary,
      recentJobs: jobs,
      recentReminderLogs: reminderLogs.slice(0, 5),
      recentBlastLogs: blastLogs.slice(0, 5)
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal mengambil dashboard stats'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\dashboard\stats.js"

@'
import { useEffect, useState } from 'react'
import AppLayout from '../../components/AppLayout'

function StatCard({ title, value, subtitle, tone = 'slate' }) {
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
      {subtitle && (
        <p className="mt-2 text-xs font-medium opacity-70">{subtitle}</p>
      )}
    </div>
  )
}

function ProgressBar({ label, value, total, tone = 'indigo' }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0

  const barClass = {
    indigo: 'bg-indigo-600',
    emerald: 'bg-emerald-600',
    rose: 'bg-rose-600',
    sky: 'bg-sky-600',
    amber: 'bg-amber-500'
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="font-bold text-slate-900">{value} / {total}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${barClass[tone] || barClass.indigo}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-slate-400">{percent}%</p>
    </div>
  )
}

function JobStatusBadge({ status }) {
  const className = {
    pending: 'bg-amber-50 text-amber-700',
    processing: 'bg-sky-50 text-sky-700',
    done: 'bg-emerald-50 text-emerald-700',
    failed: 'bg-rose-50 text-rose-700'
  }

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${className[status] || 'bg-slate-100 text-slate-700'}`}>
      {status}
    </span>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState(null)
  const [recentJobs, setRecentJobs] = useState([])
  const [recentReminderLogs, setRecentReminderLogs] = useState([])
  const [recentBlastLogs, setRecentBlastLogs] = useState([])
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function loadDashboard() {
    setLoading(true)
    setMessage('')

    const params = new URLSearchParams()

    if (start) params.set('start', start)
    if (end) params.set('end', end)

    const query = params.toString()
    const res = await fetch(`/api/dashboard/stats${query ? `?${query}` : ''}`)
    const json = await res.json()

    setLoading(false)

    if (!json.success) {
      setMessage(json.message || 'Gagal mengambil dashboard')
      return
    }

    setStats(json.summary)
    setRecentJobs(json.recentJobs || [])
    setRecentReminderLogs(json.recentReminderLogs || [])
    setRecentBlastLogs(json.recentBlastLogs || [])
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  const summary = stats || {
    totalDatabases: 0,
    totalReminderDatabases: 0,
    totalBlastDatabases: 0,
    totalContacts: 0,
    reminderSent: 0,
    reminderFailed: 0,
    reminderTotal: 0,
    blastSent: 0,
    blastFailed: 0,
    blastTotal: 0,
    totalSent: 0,
    totalFailed: 0,
    totalLogs: 0,
    totalJobs: 0,
    pendingJobs: 0,
    processingJobs: 0,
    doneJobs: 0,
    failedJobs: 0
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
            <p className="mt-2 text-slate-500">
              Ringkasan operasional reminder, broadcast, job queue, dan log pengiriman.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
              />
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
              />
              <button
                onClick={loadDashboard}
                disabled={loading}
                className="rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {loading ? 'Loading...' : 'Apply Period'}
              </button>
            </div>
          </div>
        </div>

        {message && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Total Databases"
            value={summary.totalDatabases}
            subtitle={`${summary.totalReminderDatabases} reminder, ${summary.totalBlastDatabases} blast`}
            tone="indigo"
          />
          <StatCard
            title="Total Contacts"
            value={summary.totalContacts}
            subtitle="Semua kontak aktif/import"
            tone="sky"
          />
          <StatCard
            title="Total Sent"
            value={summary.totalSent}
            subtitle="Reminder + Broadcast"
            tone="emerald"
          />
          <StatCard
            title="Total Failed"
            value={summary.totalFailed}
            subtitle="Reminder + Broadcast"
            tone="rose"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Reminder Performance</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Berdasarkan log periode yang dipilih.
                </p>
              </div>
              <div className="rounded-2xl bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700">
                {summary.reminderTotal} logs
              </div>
            </div>

            <div className="mt-6 space-y-5">
              <ProgressBar
                label="Sent"
                value={summary.reminderSent}
                total={summary.reminderTotal}
                tone="emerald"
              />
              <ProgressBar
                label="Failed"
                value={summary.reminderFailed}
                total={summary.reminderTotal}
                tone="rose"
              />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">WhatsApp Blast Performance</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Berdasarkan log periode yang dipilih.
                </p>
              </div>
              <div className="rounded-2xl bg-sky-50 px-4 py-2 text-sm font-bold text-sky-700">
                {summary.blastTotal} logs
              </div>
            </div>

            <div className="mt-6 space-y-5">
              <ProgressBar
                label="Sent"
                value={summary.blastSent}
                total={summary.blastTotal}
                tone="emerald"
              />
              <ProgressBar
                label="Failed"
                value={summary.blastFailed}
                total={summary.blastTotal}
                tone="rose"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Total Jobs" value={summary.totalJobs} subtitle="Semua job queue" tone="slate" />
          <StatCard title="Pending Jobs" value={summary.pendingJobs} subtitle="Menunggu diproses" tone="amber" />
          <StatCard title="Processing Jobs" value={summary.processingJobs} subtitle="Sedang berjalan" tone="sky" />
          <StatCard title="Done Jobs" value={summary.doneJobs} subtitle={`${summary.failedJobs} failed jobs`} tone="emerald" />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Recent Jobs</h2>
              <a href="/jobs" className="text-sm font-bold text-indigo-600">
                View Jobs
              </a>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-3">Created</th>
                    <th>Database</th>
                    <th>Status</th>
                    <th>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.map((job) => (
                    <tr key={job.id} className="border-t border-slate-100">
                      <td className="whitespace-nowrap py-3">
                        {new Date(job.created_at).toLocaleString()}
                      </td>
                      <td>{job.contact_databases?.name || '-'}</td>
                      <td><JobStatusBadge status={job.status} /></td>
                      <td>{job.sent}/{job.total}</td>
                    </tr>
                  ))}

                  {recentJobs.length === 0 && (
                    <tr>
                      <td colSpan="4" className="py-6 text-center text-slate-400">
                        Belum ada job
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Recent Logs</h2>
              <a href="/logs" className="text-sm font-bold text-indigo-600">
                View Logs
              </a>
            </div>

            <div className="mt-4 space-y-3">
              {[...recentReminderLogs.map((item) => ({ ...item, source: 'Reminder' })), ...recentBlastLogs.map((item) => ({ ...item, source: 'Blast' }))]
                .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))
                .slice(0, 6)
                .map((log) => (
                  <div key={`${log.source}-${log.id}`} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{log.source}</p>
                        <p className="mt-1 text-xs text-slate-500">{log.phone}</p>
                      </div>
                      <span className={log.status === 'sent' ? 'rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700' : 'rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700'}>
                        {log.status}
                      </span>
                    </div>
                    <p className="mt-2 truncate text-xs text-slate-500">
                      {log.error_message || log.message}
                    </p>
                  </div>
                ))}

              {recentReminderLogs.length === 0 && recentBlastLogs.length === 0 && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-center text-sm text-slate-400">
                  Belum ada log terbaru
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
'@ | Set-Content -Encoding UTF8 "pages\dashboard\index.js"

Write-Host "Dashboard polish setup selesai."