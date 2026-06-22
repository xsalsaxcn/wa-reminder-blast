import { useEffect, useMemo, useState } from 'react'
import Sidebar from '../../components/Sidebar'

function cleanText(value) {
  return String(value || '').trim()
}

function toNumber(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return number
}

function formatDate(value) {
  if (!value) return '-'

  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)

    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (err) {
    return String(value)
  }
}

async function fetchJson(url, options) {
  const response = await fetch(url, options)
  const text = await response.text()

  let data = {}

  try {
    data = JSON.parse(text)
  } catch (err) {
    data = {
      success: false,
      message: text || 'Invalid response'
    }
  }

  if (!response.ok || data.success === false) {
    throw new Error(data.message || `Request gagal: ${url}`)
  }

  return data
}

function getArray(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data.rows)) return data.rows
  if (Array.isArray(data.items)) return data.items
  if (Array.isArray(data.data)) return data.data
  if (Array.isArray(data.jobs)) return data.jobs
  if (Array.isArray(data.databases)) return data.databases
  return []
}

function normalizeDatabase(row) {
  return {
    id: row.id || row.database_id || row.databaseId,
    name: row.name || row.database_name || row.title || 'Database',
    type: row.type || row.database_type || '-',
    created_at: row.created_at
  }
}

function normalizeJob(row) {
  const total =
    toNumber(row.total_items) ||
    toNumber(row.total) ||
    toNumber(row.total_contacts) ||
    toNumber(row.item_count)

  const sent =
    toNumber(row.sent) ||
    toNumber(row.sent_items) ||
    toNumber(row.sent_count)

  const failed =
    toNumber(row.failed) ||
    toNumber(row.failed_items) ||
    toNumber(row.failed_count)

  return {
    id: row.id || row.job_id,
    name: row.name || row.title || row.job_name || 'Job',
    type: row.type || row.job_type || '-',
    status: row.status || row.job_status || '-',
    database_id: row.database_id || row.databaseId || '',
    total,
    sent,
    failed,
    created_at: row.created_at || row.createdAt
  }
}

function extractCreatedJobs(data) {
  if (Array.isArray(data.jobs)) return data.jobs
  if (data.job) return [data.job]
  if (data.data?.id) return [data.data]
  if (data.id) return [data]
  return []
}

function statusClass(status) {
  const text = cleanText(status).toLowerCase()

  if (text.includes('done') || text.includes('complete') || text.includes('sent')) {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  }

  if (text.includes('fail') || text.includes('error') || text.includes('cancel')) {
    return 'bg-red-50 text-red-700 ring-red-200'
  }

  if (text.includes('process')) {
    return 'bg-blue-50 text-blue-700 ring-blue-200'
  }

  return 'bg-yellow-50 text-yellow-700 ring-yellow-200'
}

export default function JobsPage() {
  const [databases, setDatabases] = useState([])
  const [jobs, setJobs] = useState([])
  const [selectedDatabaseId, setSelectedDatabaseId] = useState('')
  const [selectedType, setSelectedType] = useState('reminder')
  const [creating, setCreating] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [detail, setDetail] = useState(null)

  const selectedDatabase = useMemo(() => {
    return databases.find((item) => item.id === selectedDatabaseId) || null
  }, [databases, selectedDatabaseId])

  async function loadDatabases() {
    const endpoints = [
      '/api/databases/list',
      '/api/databases',
      '/api/contacts/databases',
      '/api/contacts/database-list'
    ]

    let lastError = ''

    for (const endpoint of endpoints) {
      try {
        const data = await fetchJson(endpoint, {
          method: 'GET',
          headers: {
            Accept: 'application/json'
          },
          cache: 'no-store'
        })

        const rows = getArray(data).map(normalizeDatabase)

        setDatabases(rows)

        if (!selectedDatabaseId && rows.length) {
          const reminderDb = rows.find((row) => cleanText(row.type).toLowerCase() === 'reminder')
          const selected = reminderDb || rows[0]
          setSelectedDatabaseId(selected.id)
          setSelectedType(cleanText(selected.type).toLowerCase() || 'reminder')
        }

        return
      } catch (err) {
        lastError = err.message
      }
    }

    throw new Error(lastError || 'Gagal memuat database.')
  }

  async function loadJobs() {
    const data = await fetchJson('/api/jobs?limit=100&t=' + Date.now(), {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      cache: 'no-store'
    })

    setJobs(getArray(data).map(normalizeJob))
  }

  async function loadAll() {
    setLoading(true)
    setError('')

    try {
      await Promise.all([loadDatabases(), loadJobs()])
    } catch (err) {
      setError(err.message || 'Gagal memuat data.')
    } finally {
      setLoading(false)
    }
  }

  async function processBatch(jobId) {
    setProcessing(true)
    setError('')

    try {
      const suffix = jobId ? `&job_id=${encodeURIComponent(jobId)}` : ''

      const attachmentResult = await fetchJson(`/api/jobs/process-attachment-next?limit=10${suffix}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        cache: 'no-store'
      })

      const textResult = await fetchJson(`/api/jobs/process-next?limit=10${suffix}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        cache: 'no-store'
      })

      const sent = toNumber(attachmentResult.sent) + toNumber(textResult.sent)
      const failed = toNumber(attachmentResult.failed) + toNumber(textResult.failed)
      const processed = toNumber(attachmentResult.processed) + toNumber(textResult.processed)

      setDetail({
        process_attachment: attachmentResult,
        process_text: textResult
      })

      setSuccess(`Process Batch selesai. Processed: ${processed}. Sent: ${sent}. Failed: ${failed}.`)

      await loadJobs()

      return {
        attachmentResult,
        textResult,
        sent,
        failed,
        processed
      }
    } catch (err) {
      setError(err.message || 'Process batch gagal.')
      throw err
    } finally {
      setProcessing(false)
    }
  }

  async function createReminderJobFromSchedules(databaseId) {
    return fetchJson('/api/reminder-schedules/create-jobs-now', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        database_id: databaseId,
        schedule_types: ['H-3', 'H-1', 'H-7JAM']
      })
    })
  }

  async function createNormalJob(databaseId, databaseType) {
    return fetchJson('/api/jobs/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        database_id: databaseId,
        databaseId,
        type: databaseType
      })
    })
  }

  async function createJob() {
    setCreating(true)
    setError('')
    setSuccess('')
    setDetail(null)

    try {
      if (!selectedDatabaseId) throw new Error('Pilih database dulu.')

      const databaseType =
        selectedType ||
        cleanText(selectedDatabase?.type).toLowerCase() ||
        'reminder'

      let createResult = null

      if (databaseType === 'reminder') {
        createResult = await createReminderJobFromSchedules(selectedDatabaseId)
      } else {
        createResult = await createNormalJob(selectedDatabaseId, databaseType)
      }

      const createdJobs = extractCreatedJobs(createResult)

      setDetail({
        create_job: createResult
      })

      if (!createdJobs.length) {
        setSuccess(createResult.message || 'Tidak ada job baru yang dibuat.')
        await loadJobs()
        return
      }

      setSuccess(`Job berhasil dibuat: ${createdJobs.length}. Process Batch otomatis berjalan...`)

      const processResults = []

      for (const job of createdJobs) {
        const jobId = job.id || job.job_id

        if (jobId) {
          const result = await processBatch(jobId)
          processResults.push({
            job_id: jobId,
            result
          })
        }
      }

      setDetail({
        create_job: createResult,
        process_results: processResults
      })

      await loadJobs()
    } catch (err) {
      setError(err.message || 'Create job gagal.')
    } finally {
      setCreating(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      <Sidebar />

      <main className="flex-1 p-4 lg:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-900 lg:text-3xl">
                Job Queue
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Buat job manual dari database. Setelah Create Job, Process Batch otomatis berjalan.
              </p>
            </div>

            <button
              type="button"
              onClick={loadAll}
              disabled={loading}
              className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 disabled:bg-slate-200"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {error ? (
            <div className="mb-5 whitespace-pre-line rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {success}
            </div>
          ) : null}

          <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5">
              <h2 className="text-lg font-black text-slate-900">
                Create Job from Database
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Untuk reminder, job dibuat dari reminder_schedules. Setelah job berhasil dibuat, batch otomatis diproses.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <label className="mb-2 block text-xs font-bold text-slate-500">
                  Database
                </label>
                <select
                  value={selectedDatabaseId}
                  onChange={(event) => {
                    const id = event.target.value
                    const db = databases.find((item) => item.id === id)
                    setSelectedDatabaseId(id)
                    setSelectedType(cleanText(db?.type).toLowerCase() || 'reminder')
                  }}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none"
                >
                  {!databases.length ? (
                    <option value="">Tidak ada database</option>
                  ) : null}

                  {databases.map((database) => (
                    <option key={database.id} value={database.id}>
                      {database.name} ({database.type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold text-slate-500">
                  Type
                </label>
                <select
                  value={selectedType}
                  onChange={(event) => setSelectedType(event.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none"
                >
                  <option value="reminder">Reminder</option>
                  <option value="blast">Blast</option>
                </select>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={createJob}
                disabled={creating || processing || !selectedDatabaseId}
                className="rounded-2xl bg-slate-900 px-6 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-700 disabled:bg-slate-300"
              >
                {creating ? 'Creating Job...' : 'Create Job'}
              </button>

              <button
                type="button"
                onClick={() => processBatch()}
                disabled={processing}
                className="rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-black text-white shadow-sm hover:bg-indigo-700 disabled:bg-slate-300"
              >
                {processing ? 'Processing...' : 'Process Batch'}
              </button>
            </div>
          </section>

          {detail ? (
            <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <details open>
                <summary className="cursor-pointer font-bold text-slate-900">
                  Detail response terakhir
                </summary>
                <pre className="mt-4 max-h-[360px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                  {JSON.stringify(detail, null, 2)}
                </pre>
              </details>
            </section>
          ) : null}

          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5">
              <h2 className="text-lg font-black text-slate-900">
                Jobs
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Daftar job terbaru.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-4">Job</th>
                    <th className="px-5 py-4">Type</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Total</th>
                    <th className="px-5 py-4">Sent</th>
                    <th className="px-5 py-4">Failed</th>
                    <th className="px-5 py-4">Created</th>
                    <th className="px-5 py-4">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="8" className="px-5 py-6 text-slate-500">
                        Loading jobs...
                      </td>
                    </tr>
                  ) : jobs.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="px-5 py-6 text-slate-500">
                        Belum ada jobs.
                      </td>
                    </tr>
                  ) : (
                    jobs.map((job) => (
                      <tr key={job.id} className="border-b last:border-b-0">
                        <td className="px-5 py-4">
                          <p className="font-black text-slate-900">{job.name}</p>
                          <p className="mt-1 break-all text-xs text-slate-400">{job.id}</p>
                        </td>

                        <td className="px-5 py-4">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                            {job.type}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <span className={'rounded-full px-3 py-1 text-xs font-black ring-1 ' + statusClass(job.status)}>
                            {job.status}
                          </span>
                        </td>

                        <td className="px-5 py-4 font-bold text-slate-700">{job.total}</td>
                        <td className="px-5 py-4 font-bold text-emerald-700">{job.sent}</td>
                        <td className="px-5 py-4 font-bold text-red-700">{job.failed}</td>
                        <td className="px-5 py-4 text-slate-500">{formatDate(job.created_at)}</td>

                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() => processBatch(job.id)}
                            disabled={processing}
                            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:bg-slate-300"
                          >
                            Process
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}