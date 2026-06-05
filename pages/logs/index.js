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
