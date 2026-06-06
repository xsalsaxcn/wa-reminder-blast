New-Item -ItemType Directory -Force -Path "pages\api\logs" | Out-Null
New-Item -ItemType Directory -Force -Path "pages\logs" | Out-Null

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function escapeCsv(value) {
  if (value === null || value === undefined) return ''
  const stringValue = String(value).replace(/"/g, '""')
  return `"${stringValue}"`
}

function toCsv(rows) {
  const headers = [
    'source',
    'sent_at',
    'phone',
    'status',
    'message',
    'error_message',
    'meta_message_id',
    'database_id',
    'contact_id'
  ]

  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((key) => escapeCsv(row[key])).join(',')
    )
  ]

  return lines.join('\n')
}

async function getLogsFromTable(table, source, start, end) {
  let query = supabaseAdmin
    .from(table)
    .select('*')
    .order('sent_at', { ascending: false })

  if (start) query = query.gte('sent_at', `${start}T00:00:00`)
  if (end) query = query.lte('sent_at', `${end}T23:59:59`)

  const { data, error } = await query

  if (error) throw error

  return (data || []).map((item) => ({
    source,
    sent_at: item.sent_at,
    phone: item.phone,
    status: item.status,
    message: item.message,
    error_message: item.error_message,
    meta_message_id: item.meta_message_id,
    database_id: item.database_id,
    contact_id: item.contact_id
  }))
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
    const { type = 'all', start = '', end = '' } = req.query

    let rows = []

    if (type === 'reminder') {
      rows = await getLogsFromTable('reminder_logs', 'Reminder', start, end)
    } else if (type === 'blast') {
      rows = await getLogsFromTable('blast_logs', 'WhatsApp Blast', start, end)
    } else {
      const reminderRows = await getLogsFromTable('reminder_logs', 'Reminder', start, end)
      const blastRows = await getLogsFromTable('blast_logs', 'WhatsApp Blast', start, end)

      rows = [...reminderRows, ...blastRows].sort(
        (a, b) => new Date(b.sent_at) - new Date(a.sent_at)
      )
    }

    const csv = toCsv(rows)

    const filename = `wa-${type}-logs-${start || 'all'}-${end || 'all'}.csv`

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    return res.status(200).send(csv)
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Export logs gagal'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\logs\export.js"

@'
import { useEffect, useState } from 'react'
import AppLayout from '../../components/AppLayout'

export default function LogsPage() {
  const [reminderLogs, setReminderLogs] = useState([])
  const [blastLogs, setBlastLogs] = useState([])
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [loading, setLoading] = useState(false)

  async function loadLogs() {
    setLoading(true)

    const query = start || end ? `?start=${start}&end=${end}` : ''

    const [reminderRes, blastRes] = await Promise.all([
      fetch(`/api/reminder/log${query}`),
      fetch(`/api/blast/log${query}`)
    ])

    const reminderJson = await reminderRes.json()
    const blastJson = await blastRes.json()

    setReminderLogs(reminderJson.data || [])
    setBlastLogs(blastJson.data || [])
    setLoading(false)
  }

  function exportLogs(type) {
    const params = new URLSearchParams()

    params.set('type', type)
    if (start) params.set('start', start)
    if (end) params.set('end', end)

    window.location.href = `/api/logs/export?${params.toString()}`
  }

  useEffect(() => {
    loadLogs()
  }, [])

  const allLogs = [
    ...reminderLogs.map((item) => ({ ...item, source: 'Reminder' })),
    ...blastLogs.map((item) => ({ ...item, source: 'WhatsApp Blast' }))
  ].sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))

  const sentCount = allLogs.filter((item) => item.status === 'sent').length
  const failedCount = allLogs.filter((item) => item.status === 'failed').length

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Logs</h1>
            <p className="mt-2 text-slate-500">
              Riwayat pengiriman reminder dan WhatsApp blast.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-400">Total</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{allLogs.length}</p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-xs font-semibold text-emerald-600">Sent</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{sentCount}</p>
            </div>
            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
              <p className="text-xs font-semibold text-rose-600">Failed</p>
              <p className="mt-1 text-2xl font-bold text-rose-700">{failedCount}</p>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
              <p className="text-xs font-semibold text-indigo-600">Filtered</p>
              <p className="mt-1 text-2xl font-bold text-indigo-700">
                {start || end ? 'Yes' : 'No'}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Filter & Export</h2>

          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-6">
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
              onClick={loadLogs}
              disabled={loading}
              className="rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {loading ? 'Loading...' : 'Apply Filter'}
            </button>

            <button
              onClick={() => exportLogs('reminder')}
              className="rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-3 font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              Export Reminder
            </button>

            <button
              onClick={() => exportLogs('blast')}
              className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-3 font-semibold text-sky-700 hover:bg-sky-100"
            >
              Export Blast
            </button>

            <button
              onClick={() => exportLogs('all')}
              className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              Export All
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-900">All Logs</h2>
            <button
              onClick={loadLogs}
              className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-3">Waktu</th>
                  <th>Source</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Pesan/Error</th>
                </tr>
              </thead>
              <tbody>
                {allLogs.map((log) => (
                  <tr key={`${log.source}-${log.id}`} className="border-t border-slate-100">
                    <td className="whitespace-nowrap py-3">
                      {new Date(log.sent_at).toLocaleString()}
                    </td>
                    <td>{log.source}</td>
                    <td>{log.phone}</td>
                    <td>
                      <span
                        className={
                          log.status === 'sent'
                            ? 'rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700'
                            : 'rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700'
                        }
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="max-w-md truncate">
                      {log.error_message || log.message}
                    </td>
                  </tr>
                ))}

                {allLogs.length === 0 && (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-slate-400">
                      Belum ada log
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
'@ | Set-Content -Encoding UTF8 "pages\logs\index.js"

Write-Host "Export logs CSV setup selesai."