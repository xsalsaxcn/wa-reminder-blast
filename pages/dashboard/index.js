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
