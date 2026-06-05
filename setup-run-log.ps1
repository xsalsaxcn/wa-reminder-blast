New-Item -ItemType Directory -Force -Path "pages\api\reminder" | Out-Null
New-Item -ItemType Directory -Force -Path "pages\api\blast" | Out-Null
New-Item -ItemType Directory -Force -Path "pages\reminder" | Out-Null
New-Item -ItemType Directory -Force -Path "pages\blast" | Out-Null
New-Item -ItemType Directory -Force -Path "pages\dashboard" | Out-Null
New-Item -ItemType Directory -Force -Path "pages\logs" | Out-Null

@'
async function sendWhatsAppText({ phone, message }) {
  const token = process.env.META_WA_TOKEN
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID
  const version = process.env.META_API_VERSION || 'v20.0'

  if (!token || !phoneNumberId) {
    return {
      ok: true,
      dryRun: true,
      messageId: `dryrun_${Date.now()}_${Math.random().toString(36).slice(2)}`
    }
  }

  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: {
        preview_url: false,
        body: message
      }
    })
  })

  const data = await response.json()

  if (!response.ok) {
    return {
      ok: false,
      error: data?.error?.message || JSON.stringify(data)
    }
  }

  return {
    ok: true,
    messageId: data?.messages?.[0]?.id || null
  }
}

export { sendWhatsAppText }
'@ | Set-Content -Encoding UTF8 "lib\metaWhatsapp.js"

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { sendWhatsAppText } from '../../../lib/metaWhatsapp'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  }

  try {
    const { databaseId } = req.body

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

    if (contactsError) throw contactsError

    if (!contacts || contacts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kontak reminder kosong'
      })
    }

    let sent = 0
    let failed = 0

    for (const contact of contacts) {
      const message = contact.message || `Halo ${contact.name || ''}, ini reminder dari layanan kami.`

      const result = await sendWhatsAppText({
        phone: contact.phone,
        message
      })

      if (result.ok) {
        sent += 1
      } else {
        failed += 1
      }

      await supabaseAdmin.from('reminder_logs').insert({
        database_id: databaseId,
        contact_id: contact.id,
        phone: contact.phone,
        message,
        status: result.ok ? 'sent' : 'failed',
        meta_message_id: result.messageId || null,
        error_message: result.error || (result.dryRun ? 'DRY RUN - Meta API belum dikonfigurasi' : null)
      })
    }

    return res.status(200).json({
      success: true,
      message: `Reminder selesai. Terkirim: ${sent}, Gagal: ${failed}`,
      sent,
      failed
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Run reminder gagal'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\reminder\run.js"

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { sendWhatsAppText } from '../../../lib/metaWhatsapp'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  }

  try {
    const { databaseId } = req.body

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

    if (contactsError) throw contactsError

    if (!contacts || contacts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kontak broadcast kosong'
      })
    }

    let sent = 0
    let failed = 0

    for (const contact of contacts) {
      const message = contact.message || `Halo ${contact.name || ''}, ini informasi terbaru dari layanan kami.`

      const result = await sendWhatsAppText({
        phone: contact.phone,
        message
      })

      if (result.ok) {
        sent += 1
      } else {
        failed += 1
      }

      await supabaseAdmin.from('blast_logs').insert({
        database_id: databaseId,
        contact_id: contact.id,
        phone: contact.phone,
        message,
        status: result.ok ? 'sent' : 'failed',
        meta_message_id: result.messageId || null,
        error_message: result.error || (result.dryRun ? 'DRY RUN - Meta API belum dikonfigurasi' : null)
      })
    }

    return res.status(200).json({
      success: true,
      message: `Broadcast selesai. Terkirim: ${sent}, Gagal: ${failed}`,
      sent,
      failed
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Run broadcast gagal'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\blast\run.js"

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  }

  try {
    const { start, end } = req.query

    let query = supabaseAdmin
      .from('reminder_logs')
      .select('*')
      .order('sent_at', { ascending: false })

    if (start) query = query.gte('sent_at', start)
    if (end) query = query.lte('sent_at', end)

    const { data, error } = await query

    if (error) throw error

    return res.status(200).json({
      success: true,
      data: data || []
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal mengambil reminder log'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\reminder\log.js"

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  }

  try {
    const { start, end } = req.query

    let query = supabaseAdmin
      .from('blast_logs')
      .select('*')
      .order('sent_at', { ascending: false })

    if (start) query = query.gte('sent_at', start)
    if (end) query = query.lte('sent_at', end)

    const { data, error } = await query

    if (error) throw error

    return res.status(200).json({
      success: true,
      data: data || []
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal mengambil blast log'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\blast\log.js"

@'
import { useEffect, useState } from 'react'
import AppLayout from '../../components/AppLayout'

export default function ReminderPage() {
  const [databases, setDatabases] = useState([])
  const [databaseId, setDatabaseId] = useState('')
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)

  async function loadDatabases() {
    const res = await fetch('/api/contacts/list?type=reminder')
    const json = await res.json()
    setDatabases(json.data || [])
  }

  async function loadLogs() {
    const res = await fetch('/api/reminder/log')
    const json = await res.json()
    setLogs(json.data || [])
  }

  async function runReminder() {
    if (!databaseId) {
      alert('Pilih database dulu')
      return
    }

    if (!confirm('Jalankan reminder untuk database ini?')) return

    setLoading(true)
    const res = await fetch('/api/reminder/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ databaseId })
    })

    const json = await res.json()
    setLoading(false)
    alert(json.message || 'Selesai')
    loadLogs()
  }

  useEffect(() => {
    loadDatabases()
    loadLogs()
  }, [])

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Reminder</h1>
          <p className="mt-2 text-slate-500">Pilih database, jalankan reminder, lalu pantau log pengiriman.</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="block text-sm font-semibold text-slate-700">Pilih Database Reminder</label>
          <select
            value={databaseId}
            onChange={(e) => setDatabaseId(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
          >
            <option value="">-- Pilih Database --</option>
            {databases.map((db) => (
              <option key={db.id} value={db.id}>
                {db.name} - {db.total_contacts} kontak
              </option>
            ))}
          </select>

          <button
            onClick={runReminder}
            disabled={loading}
            className="mt-5 rounded-2xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {loading ? 'Running...' : 'Run Reminder'}
          </button>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Log Reminder</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-3">Waktu</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Pesan/Error</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-slate-100">
                    <td className="py-3">{new Date(log.sent_at).toLocaleString()}</td>
                    <td>{log.phone}</td>
                    <td>
                      <span className={log.status === 'sent' ? 'rounded-full bg-emerald-50 px-3 py-1 text-emerald-700' : 'rounded-full bg-rose-50 px-3 py-1 text-rose-700'}>
                        {log.status}
                      </span>
                    </td>
                    <td className="max-w-md truncate">{log.error_message || log.message}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan="4" className="py-6 text-center text-slate-400">Belum ada log</td>
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
'@ | Set-Content -Encoding UTF8 "pages\reminder\index.js"

@'
import { useEffect, useState } from 'react'
import AppLayout from '../../components/AppLayout'

export default function BlastPage() {
  const [databases, setDatabases] = useState([])
  const [databaseId, setDatabaseId] = useState('')
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)

  async function loadDatabases() {
    const res = await fetch('/api/contacts/list?type=blast')
    const json = await res.json()
    setDatabases(json.data || [])
  }

  async function loadLogs() {
    const res = await fetch('/api/blast/log')
    const json = await res.json()
    setLogs(json.data || [])
  }

  async function runBlast() {
    if (!databaseId) {
      alert('Pilih database dulu')
      return
    }

    if (!confirm('Jalankan WhatsApp Blast untuk database ini?')) return

    setLoading(true)
    const res = await fetch('/api/blast/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ databaseId })
    })

    const json = await res.json()
    setLoading(false)
    alert(json.message || 'Selesai')
    loadLogs()
  }

  useEffect(() => {
    loadDatabases()
    loadLogs()
  }, [])

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">WhatsApp Blast</h1>
          <p className="mt-2 text-slate-500">Pilih database, jalankan broadcast, lalu pantau log pengiriman.</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="block text-sm font-semibold text-slate-700">Pilih Database WhatsApp Blast</label>
          <select
            value={databaseId}
            onChange={(e) => setDatabaseId(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
          >
            <option value="">-- Pilih Database --</option>
            {databases.map((db) => (
              <option key={db.id} value={db.id}>
                {db.name} - {db.total_contacts} kontak
              </option>
            ))}
          </select>

          <button
            onClick={runBlast}
            disabled={loading}
            className="mt-5 rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? 'Running...' : 'Run Broadcast'}
          </button>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Log WhatsApp Blast</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-3">Waktu</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Pesan/Error</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-slate-100">
                    <td className="py-3">{new Date(log.sent_at).toLocaleString()}</td>
                    <td>{log.phone}</td>
                    <td>
                      <span className={log.status === 'sent' ? 'rounded-full bg-emerald-50 px-3 py-1 text-emerald-700' : 'rounded-full bg-rose-50 px-3 py-1 text-rose-700'}>
                        {log.status}
                      </span>
                    </td>
                    <td className="max-w-md truncate">{log.error_message || log.message}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan="4" className="py-6 text-center text-slate-400">Belum ada log</td>
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
'@ | Set-Content -Encoding UTF8 "pages\blast\index.js"

@'
import { useEffect, useState } from 'react'
import AppLayout from '../../components/AppLayout'

function countByStatus(logs, status) {
  return logs.filter((item) => item.status === status).length
}

export default function DashboardPage() {
  const [reminderLogs, setReminderLogs] = useState([])
  const [blastLogs, setBlastLogs] = useState([])
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  async function loadStats() {
    const reminderUrl = `/api/reminder/log${start || end ? `?start=${start}&end=${end}` : ''}`
    const blastUrl = `/api/blast/log${start || end ? `?start=${start}&end=${end}` : ''}`

    const [reminderRes, blastRes] = await Promise.all([
      fetch(reminderUrl),
      fetch(blastUrl)
    ])

    const reminderJson = await reminderRes.json()
    const blastJson = await blastRes.json()

    setReminderLogs(reminderJson.data || [])
    setBlastLogs(blastJson.data || [])
  }

  useEffect(() => {
    loadStats()
  }, [])

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="mt-2 text-slate-500">Ringkasan pengiriman reminder dan WhatsApp blast.</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Pilih Periode</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3"
            />
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3"
            />
            <button
              onClick={loadStats}
              className="rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700"
            >
              Tampilkan
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">Reminder</h2>
            <div className="mt-5 grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-emerald-50 p-5">
                <p className="text-sm text-emerald-700">Berhasil / Terkirim</p>
                <p className="mt-2 text-3xl font-bold text-emerald-700">{countByStatus(reminderLogs, 'sent')}</p>
              </div>
              <div className="rounded-2xl bg-rose-50 p-5">
                <p className="text-sm text-rose-700">Gagal</p>
                <p className="mt-2 text-3xl font-bold text-rose-700">{countByStatus(reminderLogs, 'failed')}</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">WhatsApp Blast</h2>
            <div className="mt-5 grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-emerald-50 p-5">
                <p className="text-sm text-emerald-700">Terkirim</p>
                <p className="mt-2 text-3xl font-bold text-emerald-700">{countByStatus(blastLogs, 'sent')}</p>
              </div>
              <div className="rounded-2xl bg-rose-50 p-5">
                <p className="text-sm text-rose-700">Gagal</p>
                <p className="mt-2 text-3xl font-bold text-rose-700">{countByStatus(blastLogs, 'failed')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
'@ | Set-Content -Encoding UTF8 "pages\dashboard\index.js"

@'
import { useEffect, useState } from 'react'
import AppLayout from '../../components/AppLayout'

export default function LogsPage() {
  const [reminderLogs, setReminderLogs] = useState([])
  const [blastLogs, setBlastLogs] = useState([])

  async function loadLogs() {
    const [reminderRes, blastRes] = await Promise.all([
      fetch('/api/reminder/log'),
      fetch('/api/blast/log')
    ])

    const reminderJson = await reminderRes.json()
    const blastJson = await blastRes.json()

    setReminderLogs(reminderJson.data || [])
    setBlastLogs(blastJson.data || [])
  }

  useEffect(() => {
    loadLogs()
  }, [])

  const allLogs = [
    ...reminderLogs.map((item) => ({ ...item, source: 'Reminder' })),
    ...blastLogs.map((item) => ({ ...item, source: 'WhatsApp Blast' }))
  ].sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Logs</h1>
          <p className="mt-2 text-slate-500">Semua riwayat pengiriman reminder dan broadcast.</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="overflow-x-auto">
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
                    <td className="py-3">{new Date(log.sent_at).toLocaleString()}</td>
                    <td>{log.source}</td>
                    <td>{log.phone}</td>
                    <td>
                      <span className={log.status === 'sent' ? 'rounded-full bg-emerald-50 px-3 py-1 text-emerald-700' : 'rounded-full bg-rose-50 px-3 py-1 text-rose-700'}>
                        {log.status}
                      </span>
                    </td>
                    <td className="max-w-md truncate">{log.error_message || log.message}</td>
                  </tr>
                ))}
                {allLogs.length === 0 && (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-slate-400">Belum ada log</td>
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

Write-Host "Setup run, broadcast, logs, dashboard selesai."