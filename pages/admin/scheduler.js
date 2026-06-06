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
