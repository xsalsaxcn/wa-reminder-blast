import { useEffect, useMemo, useState } from 'react'
import Sidebar from '../../components/Sidebar'

function cleanText(value) {
  return String(value || '').trim()
}

function shortText(value, max = 100) {
  const text = cleanText(value)
  if (text.length <= max) return text
  return text.slice(0, max) + '...'
}

function getErrorMessage(data, fallback) {
  return (
    data?.message ||
    data?.error ||
    data?.meta?.error?.message ||
    data?.last?.message ||
    fallback ||
    'Terjadi error.'
  )
}

export default function TemplateBlastPage() {
  const [databases, setDatabases] = useState([])
  const [templates, setTemplates] = useState([])
  const [databaseId, setDatabaseId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState('')
  const [detail, setDetail] = useState(null)
  const [createdJob, setCreatedJob] = useState(null)

  const selectedTemplate = useMemo(() => {
    return templates.find((item) => item.id === templateId) || null
  }, [templates, templateId])

  async function readResponse(response) {
    const text = await response.text()

    try {
      return JSON.parse(text)
    } catch (error) {
      return {
        success: response.ok,
        raw: text
      }
    }
  }

  async function loadOptions() {
    setLoading(true)
    setMessage('')

    try {
      const response = await fetch('/api/template-blast/options')
      const data = await readResponse(response)

      setDetail(data)

      if (!response.ok || !data.success) {
        throw new Error(getErrorMessage(data, 'Gagal memuat options.'))
      }

      setDatabases(data.databases || [])
      setTemplates(data.templates || [])

      if (!databaseId && data.databases?.[0]?.id) {
        setDatabaseId(data.databases[0].id)
      }

      if (!templateId && data.templates?.[0]?.id) {
        setTemplateId(data.templates[0].id)
      }

      setMessage('Options berhasil dimuat.')
    } catch (error) {
      setMessage(error.message || 'Gagal memuat options.')
    } finally {
      setLoading(false)
    }
  }

  async function createJob() {
    setLoading(true)
    setMessage('')
    setDetail(null)

    try {
      const response = await fetch('/api/template-blast/create-job', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          database_id: databaseId,
          template_id: templateId
        })
      })

      const data = await readResponse(response)
      setDetail(data)

      if (!response.ok || !data.success) {
        throw new Error(getErrorMessage(data, 'Gagal membuat template blast job.'))
      }

      setCreatedJob(data.job)
      setMessage(`Job berhasil dibuat. Items: ${data.items_created}.`)
      return data.job
    } catch (error) {
      setMessage(error.message || 'Gagal membuat job.')
      return null
    } finally {
      setLoading(false)
    }
  }

  async function processJob(job) {
    const targetJob = job || createdJob

    if (!targetJob?.id) {
      setMessage('Belum ada job. Klik Create Job dulu.')
      return
    }

    setProcessing(true)
    setMessage('Processing template blast...')
    setDetail(null)

    try {
      let totalSent = 0
      let totalFailed = 0
      let totalProcessed = 0
      let lastData = null
      const batches = []

      for (let i = 0; i < 200; i += 1) {
        const response = await fetch(
          `/api/jobs/process-template-next?job_id=${encodeURIComponent(targetJob.id)}&limit=10&force=1`
        )

        const data = await readResponse(response)
        lastData = data
        batches.push(data)

        if (!response.ok || !data.success) {
          const errorDetail = {
            success: false,
            message: getErrorMessage(data, 'Process template batch gagal.'),
            status: response.status,
            job_id: targetJob.id,
            batch_index: i + 1,
            response: data,
            batches
          }

          setDetail(errorDetail)

          throw new Error(errorDetail.message)
        }

        totalSent += Number(data.sent || 0)
        totalFailed += Number(data.failed || 0)
        totalProcessed += Number(data.processed || 0)

        if (!data.processed || Number(data.processed) <= 0) {
          break
        }
      }

      const summary = {
        success: true,
        message: 'Template blast processing selesai.',
        job_id: targetJob.id,
        processed: totalProcessed,
        sent: totalSent,
        failed: totalFailed,
        last: lastData,
        batches
      }

      setDetail(summary)
      setMessage(`Selesai. Processed: ${totalProcessed}, Sent: ${totalSent}, Failed: ${totalFailed}.`)
    } catch (error) {
      setMessage(error.message || 'Process template batch gagal.')
    } finally {
      setProcessing(false)
    }
  }

  async function createAndProcess() {
    const job = await createJob()
    if (job?.id) {
      await processJob(job)
    }
  }

  useEffect(() => {
    loadOptions()
  }, [])

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-950">
      <Sidebar />

      <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-600">
                  WhatsApp Template Blast
                </p>
                <h1 className="mt-2 text-2xl font-black tracking-tight">
                  Template Blast
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Kirim blast menggunakan approved Meta template, aman untuk kontak di luar 24 jam.
                </p>
              </div>

              <button
                type="button"
                onClick={loadOptions}
                disabled={loading}
                className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>

          {message ? (
            <div className="rounded-2xl border border-cyan-100 bg-cyan-50 px-5 py-4 text-sm font-semibold text-cyan-800">
              {message}
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black">Create Template Blast Job</h2>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Database Kontak
                  </label>
                  <select
                    value={databaseId}
                    onChange={(event) => setDatabaseId(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-400"
                  >
                    {databases.map((database) => (
                      <option key={database.id} value={database.id}>
                        {database.name || database.title || database.id} {database.type ? `(${database.type})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Approved Template
                  </label>
                  <select
                    value={templateId}
                    onChange={(event) => setTemplateId(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-400"
                  >
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} - {template.language} - {template.header_type || 'NONE'}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedTemplate ? (
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm">
                    <div className="font-black text-slate-900">{selectedTemplate.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {selectedTemplate.category} / {selectedTemplate.language} / Header {selectedTemplate.header_type || 'NONE'}
                    </div>
                    <div className="mt-3 whitespace-pre-wrap text-slate-700">
                      {shortText(selectedTemplate.body, 300)}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                    Belum ada template APPROVED. Buka Admin → Meta Templates lalu sync status.
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3">
                  <button
                    type="button"
                    onClick={createJob}
                    disabled={loading || !databaseId || !templateId}
                    className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Create Job Only
                  </button>

                  <button
                    type="button"
                    onClick={createAndProcess}
                    disabled={loading || processing || !databaseId || !templateId}
                    className="rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-cyan-200 hover:opacity-95 disabled:opacity-60"
                  >
                    {processing ? 'Processing...' : 'Create & Send Now'}
                  </button>

                  <button
                    type="button"
                    onClick={() => processJob()}
                    disabled={processing || !createdJob?.id}
                    className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    Process Current Job
                  </button>
                </div>

                {createdJob?.id ? (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-xs text-emerald-800">
                    Current job: <b>{createdJob.name || createdJob.title}</b>
                    <br />
                    {createdJob.id}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-black">Cara CSV untuk template ini</h2>

                <p className="mt-2 text-sm text-slate-600">
                  Untuk template <b>blast_cv26</b> yang punya variable <b>{'{{1}}'}</b>, sistem otomatis memakai sapaan dari nama kontak, misalnya <b>Kak Susi</b>.
                </p>

                <pre className="mt-4 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-cyan-50">
{`name,phone,message,attachment_url,attachment_type,attachment_filename
Susi Salwa,628568032191,,https://cdn.phototourl.com/free/2026-06-22-a48b8976-8ef9-470f-9345-ab3843761ee1.jpg,image,CV2026_Flyer.jpg
Budi,6285137908391,,https://cdn.phototourl.com/free/2026-06-22-a48b8976-8ef9-470f-9345-ab3843761ee1.jpg,image,CV2026_Flyer.jpg`}
                </pre>

                <p className="mt-3 text-xs text-slate-500">
                  Kalau attachment_url kosong, sistem akan pakai sample_url dari template.
                </p>
              </div>

              <details className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm" open>
                <summary className="cursor-pointer text-sm font-black">
                  Detail response terakhir
                </summary>
                <pre className="mt-4 max-h-96 overflow-auto rounded-2xl bg-black p-4 text-xs text-cyan-50">
                  {JSON.stringify(detail, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}