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
