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
