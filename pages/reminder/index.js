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
