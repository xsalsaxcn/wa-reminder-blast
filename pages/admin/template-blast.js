import { useEffect, useMemo, useRef, useState } from 'react'
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

function headerNeedsMedia(template) {
  const type = cleanText(template?.header_type).toUpperCase()
  return type === 'IMAGE' || type === 'DOCUMENT' || type === 'VIDEO'
}

function normalizeHeaderMediaType(template) {
  const type = cleanText(template?.header_type).toUpperCase()

  if (type === 'IMAGE') return 'image'
  if (type === 'VIDEO') return 'video'
  if (type === 'DOCUMENT') return 'document'

  return ''
}

function parseTemplateComponents(value) {
  if (Array.isArray(value)) return value

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch (error) {
      return []
    }
  }

  return []
}

function getResponsiveUrlButton(template) {
  const components = parseTemplateComponents(template?.components)
  const group = components.find((component) => {
    return cleanText(component?.type).toUpperCase() === 'BUTTONS'
  })

  const buttons = Array.isArray(group?.buttons) ? group.buttons : []

  const index = buttons.findIndex((button) => {
    const type = cleanText(button?.type).toUpperCase()
    const url = cleanText(button?.url)

    return type === 'URL' && url.includes('/view-image?src={{1}}')
  })

  if (index < 0) return null

  return {
    index,
    text: cleanText(buttons[index]?.text),
    url: cleanText(buttons[index]?.url)
  }
}

function hasUrlButton(template) {
  const components = parseTemplateComponents(template?.components)
  const group = components.find((component) => {
    return cleanText(component?.type).toUpperCase() === 'BUTTONS'
  })

  const buttons = Array.isArray(group?.buttons) ? group.buttons : []

  return buttons.some((button) => {
    return cleanText(button?.type).toUpperCase() === 'URL'
  })
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isPermanentDeliveryFailure(row) {
  const reason = cleanText(
    row?.error_message ||
    row?.errorMessage ||
    row?.failure_reason ||
    row?.reason ||
    ''
  ).toLowerCase()

  if (!reason) return false

  const permanentPatterns = [
    'payment',
    'eligibility',
    'business eligibility',
    'message undeliverable',
    'undeliverable',
    're-engagement',
    'outside the allowed',
    'not a valid whatsapp',
    'invalid recipient',
    'recipient is not',
    'blocked',
    'opted out',
    'template paused',
    'template disabled',
    'quality',
    '131026',
    '131042',
    '131047',
    '131049'
  ]

  return permanentPatterns.some((pattern) => reason.includes(pattern))
}

function summarizeDelivery(data) {
  const summary = data?.summary || {}
  const target = Number(summary.target || 0)
  const accepted = Number(summary.accepted ?? summary.sent ?? 0)
  const delivered = Number(summary.delivered || 0)
  const read = Number(summary.read || 0)
  const failed = Number(summary.failed || 0)
  const acceptedOnly = Math.max(0, accepted - delivered)
  const pending = Math.max(0, target - accepted - failed)

  return {
    target,
    accepted,
    acceptedOnly,
    delivered,
    read,
    failed,
    pending
  }
}

export default function TemplateBlastPage() {
  const fileInputRef = useRef(null)

  const [databases, setDatabases] = useState([])
  const [templates, setTemplates] = useState([])
  const [mediaAssets, setMediaAssets] = useState([])

  const [databaseId, setDatabaseId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [mediaAssetId, setMediaAssetId] = useState('')

  const [mediaFile, setMediaFile] = useState(null)
  const [mediaAssetName, setMediaAssetName] = useState('')
  const [uploadingMedia, setUploadingMedia] = useState(false)

  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaUrlAssetName, setMediaUrlAssetName] = useState('')
  const [importingMediaUrl, setImportingMediaUrl] = useState(false)
  const [responsiveImageUrl, setResponsiveImageUrl] = useState('')

  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState('')
  const [detail, setDetail] = useState(null)
  const [createdJob, setCreatedJob] = useState(null)

  const selectedTemplate = useMemo(() => {
    return templates.find((item) => item.id === templateId) || null
  }, [templates, templateId])

  const responsiveUrlButton = useMemo(() => {
    return getResponsiveUrlButton(selectedTemplate)
  }, [selectedTemplate])

  const selectedTemplateHasUrlButton = useMemo(() => {
    return hasUrlButton(selectedTemplate)
  }, [selectedTemplate])

  const responsiveViewerUrl = useMemo(() => {
    const source = cleanText(responsiveImageUrl)

    if (!source) return ''

    return `https://wa-reminder-blast.vercel.app/view-image?src=${encodeURIComponent(source)}`
  }, [responsiveImageUrl])

  const selectedMediaAsset = useMemo(() => {
    return mediaAssets.find((item) => item.id === mediaAssetId) || null
  }, [mediaAssets, mediaAssetId])

  const compatibleMediaAssets = useMemo(() => {
    const requiredType = normalizeHeaderMediaType(selectedTemplate)

    if (!requiredType) return mediaAssets

    return mediaAssets.filter((item) => {
      return cleanText(item.media_type).toLowerCase() === requiredType
    })
  }, [mediaAssets, selectedTemplate])

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
      const response = await fetch('/api/template-blast/options?t=' + Date.now(), {
        cache: 'no-store'
      })
      const data = await readResponse(response)

      setDetail(data)

      if (!response.ok || !data.success) {
        throw new Error(getErrorMessage(data, 'Gagal memuat options.'))
      }

      setDatabases(data.databases || [])
      setTemplates(data.templates || [])
      setMediaAssets(data.media_assets || [])

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

  function handleMediaFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'application/pdf'
    ]

    if (!allowed.includes(file.type)) {
      setMessage('Format media belum didukung. Gunakan JPG, PNG, WEBP, MP4, atau PDF.')
      event.target.value = ''
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setMessage('Ukuran file maksimal 10 MB. Kompres dulu.')
      event.target.value = ''
      return
    }

    setMediaFile(file)

    if (!mediaAssetName) {
      setMediaAssetName(file.name)
    }
  }

  async function uploadMediaToMeta() {
    if (!mediaFile) {
      setMessage('Pilih file dulu.')
      return
    }

    setUploadingMedia(true)
    setMessage('Uploading media ke Meta...')
    setDetail(null)

    try {
      const base64 = await fileToBase64(mediaFile)

      const response = await fetch('/api/meta/media/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          asset_name: mediaAssetName || mediaFile.name,
          campaign_name: selectedTemplate?.name || '',
          file_name: mediaFile.name,
          mime_type: mediaFile.type,
          base64
        })
      })

      const data = await readResponse(response)
      setDetail(data)

      if (!response.ok || !data.success) {
        throw new Error(getErrorMessage(data, 'Gagal upload media ke Meta.'))
      }

      const nextAsset = data.media
      const nextAssets = [nextAsset, ...mediaAssets.filter((item) => item.id !== nextAsset.id)]

      setMediaAssets(nextAssets)
      setMediaAssetId(nextAsset.id)
      setMediaFile(null)
      setMediaAssetName('')

      if (fileInputRef.current) fileInputRef.current.value = ''

      setMessage('Media berhasil diupload ke Meta. Media ID siap dipakai untuk blast.')
    } catch (error) {
      setMessage(error.message || 'Gagal upload media.')
    } finally {
      setUploadingMedia(false)
    }
  }

  async function importImageUrlToMeta() {
    const url = cleanText(mediaUrl)

    if (!url) {
      setMessage('Isi URL gambar dulu.')
      return
    }

    if (normalizeHeaderMediaType(selectedTemplate) !== 'image') {
      setMessage('Image URL hanya bisa dipakai untuk template dengan Header IMAGE.')
      return
    }

    setImportingMediaUrl(true)
    setMessage('Mengambil URL 1x lalu menyiapkan gambar di Meta...')
    setDetail(null)

    try {
      const response = await fetch('/api/meta/media/import-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          asset_name: mediaUrlAssetName || selectedTemplate?.name || 'URL Image',
          campaign_name: selectedTemplate?.name || '',
          image_url: url
        })
      })

      const data = await readResponse(response)
      setDetail(data)

      if (!response.ok || !data.success) {
        throw new Error(getErrorMessage(data, 'Gagal menyiapkan Image URL.'))
      }

      const nextAsset = data.media
      const nextAssets = [
        nextAsset,
        ...mediaAssets.filter((item) => item.id !== nextAsset.id)
      ]

      setMediaAssets(nextAssets)
      setMediaAssetId(nextAsset.id)

      setMessage(
        'Image URL siap. Notiva mengambil file 1x lalu memakai Meta Media ID saat blast, jadi penerima menerima gambar header, bukan link preview.'
      )
    } catch (error) {
      setMessage(error.message || 'Gagal menyiapkan Image URL.')
    } finally {
      setImportingMediaUrl(false)
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
          template_id: templateId,
          header_media_id: selectedMediaAsset?.meta_media_id || '',
          header_media_type: selectedMediaAsset?.media_type || '',
          header_media_filename: selectedMediaAsset?.filename || '',
          responsive_image_url: responsiveUrlButton ? cleanText(responsiveImageUrl) : ''
        })
      })

      const data = await readResponse(response)
      setDetail(data)

      if (!response.ok || !data.success) {
        throw new Error(getErrorMessage(data, 'Gagal membuat template blast job.'))
      }

      setCreatedJob(data.job)

      if (data.media_mode === 'meta_media_id') {
        setMessage(`Job berhasil dibuat pakai Meta Media ID. Items: ${data.items_created}.`)
      } else {
        setMessage(`Job berhasil dibuat. Items: ${data.items_created}.`)
      }

      return data.job
    } catch (error) {
      setMessage(error.message || 'Gagal membuat job.')
      return null
    } finally {
      setLoading(false)
    }
  }

  async function loadDeliveryDetail(jobId) {
    const params = new URLSearchParams()
    params.set('job_id', jobId)
    params.set('bucket', 'all')
    params.set('t', String(Date.now()))

    const response = await fetch('/api/job-performance/detail?' + params.toString(), {
      cache: 'no-store'
    })

    const data = await readResponse(response)

    if (!response.ok || !data.success) {
      throw new Error(getErrorMessage(data, 'Gagal membaca status delivery.'))
    }

    return data
  }

  async function retrySelectedFailed(jobId, itemIds) {
    const ids = Array.from(new Set((itemIds || []).map(cleanText).filter(Boolean)))

    if (!ids.length) {
      return {
        processed: 0,
        sent: 0,
        failed: 0
      }
    }

    let totalProcessed = 0
    let totalSent = 0
    let totalFailed = 0

    for (let guard = 0; guard < 200; guard += 1) {
      const response = await fetch('/api/jobs/process-template-next', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          job_id: jobId,
          limit: 50,
          force: 1,
          manual_run: 1,
          retry_failed: 1,
          retry_item_ids: ids
        })
      })

      const data = await readResponse(response)

      if (!response.ok || !data.success) {
        throw new Error(getErrorMessage(data, 'Retry delivery gagal.'))
      }

      const processed = Number(data.processed || 0)
      totalProcessed += processed
      totalSent += Number(data.sent || 0)
      totalFailed += Number(data.failed || 0)

      if (processed <= 0) break
    }

    return {
      processed: totalProcessed,
      sent: totalSent,
      failed: totalFailed
    }
  }

  async function assureDelivery(jobId, initialSummary) {
    const maxRetryRounds = 2
    const pollDelayMs = 5000
    const pollsPerRound = 6
    let retryRound = 0
    let latest = null

    for (let round = 0; round <= maxRetryRounds; round += 1) {
      for (let poll = 0; poll < pollsPerRound; poll += 1) {
        if (poll > 0 || round > 0) {
          await sleep(pollDelayMs)
        }

        latest = await loadDeliveryDetail(jobId)
        const counts = summarizeDelivery(latest)

        setMessage(
          `Memastikan delivery... Target: ${counts.target}, Delivered/Read: ${counts.delivered}, ` +
          `Accepted menunggu final: ${counts.acceptedOnly}, Failed: ${counts.failed}.`
        )

        if (counts.target > 0 && counts.delivered >= counts.target) {
          return {
            status: 'all_delivered',
            retry_rounds: retryRound,
            counts,
            detail: latest
          }
        }

        const failedRows = (latest.rows || []).filter((row) => row?.failed)
        const permanentFailed = failedRows.filter(isPermanentDeliveryFailure)
        const retryableFailed = failedRows.filter((row) => !isPermanentDeliveryFailure(row))

        if (permanentFailed.length) {
          return {
            status: 'blocked_by_meta',
            retry_rounds: retryRound,
            counts,
            permanent_failed: permanentFailed,
            retryable_failed: retryableFailed,
            detail: latest
          }
        }

        if (retryableFailed.length && retryRound < maxRetryRounds) {
          retryRound += 1

          setMessage(
            `Ada ${retryableFailed.length} gagal final. Retry aman ${retryRound}/${maxRetryRounds}...`
          )

          await retrySelectedFailed(
            jobId,
            retryableFailed.map((row) => row.item_id || row.id)
          )

          break
        }

        if (retryableFailed.length && retryRound >= maxRetryRounds) {
          return {
            status: 'retry_exhausted',
            retry_rounds: retryRound,
            counts,
            retryable_failed: retryableFailed,
            detail: latest
          }
        }

        if (counts.pending <= 0 && counts.acceptedOnly <= 0 && counts.failed <= 0) {
          return {
            status: 'final_no_failures',
            retry_rounds: retryRound,
            counts,
            detail: latest
          }
        }
      }
    }

    latest = latest || await loadDeliveryDetail(jobId)

    return {
      status: 'waiting_final_callback',
      retry_rounds: retryRound,
      counts: summarizeDelivery(latest),
      detail: latest,
      initial: initialSummary
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
          `/api/jobs/process-template-next?job_id=${encodeURIComponent(targetJob.id)}&limit=50&force=1&manual_run=1`
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
      setMessage(
        `Pengiriman awal selesai. Processed: ${totalProcessed}, Accepted: ${totalSent}, Failed: ${totalFailed}. ` +
        `Sekarang memastikan status final...`
      )

      const assurance = await assureDelivery(targetJob.id, summary)
      const counts = assurance.counts || {}

      setDetail({
        ...summary,
        delivery_assurance: assurance
      })

      if (assurance.status === 'all_delivered' || assurance.status === 'final_no_failures') {
        setMessage(
          `Selesai. ${counts.delivered || 0}/${counts.target || 0} sudah Delivered/Read. ` +
          `Retry otomatis: ${assurance.retry_rounds || 0}.`
        )
      } else if (assurance.status === 'blocked_by_meta') {
        const firstBlocked = assurance.permanent_failed?.[0]
        const reason = cleanText(firstBlocked?.error_message || firstBlocked?.errorMessage) || 'Ditolak Meta.'

        setMessage(
          `Pengiriman sudah dicoba, tetapi ${counts.failed || 0} pesan diblokir final oleh Meta. ` +
          `Tidak di-retry otomatis untuk mencegah spam/biaya berulang. Alasan: ${shortText(reason, 160)}`
        )
      } else if (assurance.status === 'retry_exhausted') {
        setMessage(
          `Pengiriman sudah di-retry ${assurance.retry_rounds || 0}x. ` +
          `${counts.failed || 0} masih gagal final; cek Failure Reason di Job Performance.`
        )
      } else {
        setMessage(
          `Pengiriman awal selesai. Delivered/Read: ${counts.delivered || 0}/${counts.target || 0}. ` +
          `${counts.acceptedOnly || 0} masih Accepted menunggu callback Meta. ` +
          `Accepted tidak diulang agar tidak terjadi pesan duplikat.`
        )
      }
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
                  Kirim blast menggunakan approved Meta template. Untuk gambar campaign, gunakan Meta Media ID agar tidak membebani Supabase Storage.
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
            <div className="space-y-6">
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
                      onChange={(event) => {
                        setTemplateId(event.target.value)
                        setMediaAssetId('')
                        setResponsiveImageUrl('')
                      }}
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

                  {selectedTemplateHasUrlButton ? (
                    <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
                      <p className="text-sm font-black text-violet-900">
                        URL Button Responsive · Hemat Egress
                      </p>

                      {responsiveUrlButton ? (
                        <>
                          <p className="mt-1 text-xs leading-5 text-violet-700">
                            Template ini sudah dynamic. Tempel URL gambar asli; Notiva otomatis
                            mengirim parameter URL Button ke viewer responsive.
                          </p>

                          <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-violet-800">
                            URL gambar asli
                          </label>
                          <input
                            value={responsiveImageUrl}
                            onChange={(event) => setResponsiveImageUrl(event.target.value)}
                            placeholder="https://cdn.phototourl.com/...jpg"
                            inputMode="url"
                            className="mt-2 w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-500"
                          />

                          {responsiveViewerUrl ? (
                            <div className="mt-3 rounded-xl bg-white p-3 text-xs leading-5 text-violet-900 ring-1 ring-violet-100">
                              <div className="font-black">Responsive URL hasil:</div>
                              <div className="mt-1 break-all">{responsiveViewerUrl}</div>
                              <a
                                href={responsiveViewerUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-block font-black text-violet-700 underline"
                              >
                                Test viewer
                              </a>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                          URL Button template ini masih static. Link lama akan tetap dipakai.
                          <br />
                          Duplicate template sekali di Meta dengan URL Button:
                          <div className="mt-2 break-all rounded-lg bg-white p-2 font-mono text-[11px] ring-1 ring-amber-100">
                            https://wa-reminder-blast.vercel.app/view-image?src={'{{1}}'}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {headerNeedsMedia(selectedTemplate) ? (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                      <p className="text-sm font-black text-emerald-900">
                        Header Media via Meta Media ID
                      </p>
                      <p className="mt-1 text-xs text-emerald-700">
                        Pilih media ID agar gambar tidak diambil dari Supabase Storage saat blast.
                      </p>

                      <div className="mt-4">
                        <label className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                          Pilih Media ID
                        </label>
                        <select
                          value={mediaAssetId}
                          onChange={(event) => setMediaAssetId(event.target.value)}
                          className="mt-2 w-full rounded-2xl border border-emerald-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                        >
                          <option value="">Tidak pakai Media ID / fallback URL lama</option>
                          {compatibleMediaAssets.map((asset) => (
                            <option key={asset.id} value={asset.id}>
                              {asset.asset_name || asset.filename} - {asset.media_type} - {asset.meta_media_id}
                            </option>
                          ))}
                        </select>

                        {selectedMediaAsset ? (
                          <div className="mt-3 rounded-xl bg-white p-3 text-xs text-emerald-800 ring-1 ring-emerald-100">
                            <div><b>Media ID:</b> {selectedMediaAsset.meta_media_id}</div>
                            <div><b>File:</b> {selectedMediaAsset.filename}</div>
                            <div><b>Size:</b> {selectedMediaAsset.file_size ? `${(selectedMediaAsset.file_size / 1024).toFixed(0)} KB` : '-'}</div>
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-emerald-100">
                        <p className="text-xs font-black uppercase tracking-wide text-emerald-800">
                          Upload Media Baru ke Meta
                        </p>

                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf"
                          onChange={handleMediaFileChange}
                          className="mt-3 w-full rounded-2xl border border-emerald-200 px-4 py-3 text-sm"
                        />

                        <input
                          value={mediaAssetName}
                          onChange={(event) => setMediaAssetName(event.target.value)}
                          placeholder="Nama asset, contoh: Flyer INHARMONYVERSARY"
                          className="mt-3 w-full rounded-2xl border border-emerald-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                        />

                        {mediaFile ? (
                          <p className="mt-2 text-xs text-emerald-700">
                            File siap: {mediaFile.name} ({(mediaFile.size / 1024).toFixed(0)} KB)
                          </p>
                        ) : null}

                        <button
                          type="button"
                          onClick={uploadMediaToMeta}
                          disabled={uploadingMedia || !mediaFile}
                          className="mt-3 w-full rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {uploadingMedia ? 'Uploading...' : 'Upload 1x ke Meta'}
                        </button>
                      </div>

                      {normalizeHeaderMediaType(selectedTemplate) === 'image' ? (
                        <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-cyan-100">
                          <div className="flex flex-col gap-1">
                            <p className="text-xs font-black uppercase tracking-wide text-cyan-800">
                              Image URL → WhatsApp Full Preview
                            </p>
                            <p className="text-xs leading-5 text-slate-600">
                              Tempel URL gambar publik. Notiva mengambil file 1x, upload ke Meta,
                              lalu blast memakai Media ID. WhatsApp yang menyesuaikan tampilan ke layar HP.
                            </p>
                          </div>

                          <input
                            value={mediaUrl}
                            onChange={(event) => setMediaUrl(event.target.value)}
                            placeholder="https://domain.com/poster.jpg"
                            inputMode="url"
                            className="mt-3 w-full rounded-2xl border border-cyan-200 px-4 py-3 text-sm outline-none focus:border-cyan-500"
                          />

                          <input
                            value={mediaUrlAssetName}
                            onChange={(event) => setMediaUrlAssetName(event.target.value)}
                            placeholder="Nama asset opsional"
                            className="mt-3 w-full rounded-2xl border border-cyan-200 px-4 py-3 text-sm outline-none focus:border-cyan-500"
                          />

                          {cleanText(mediaUrl) ? (
                            <div className="mt-3 rounded-2xl bg-slate-100 p-3">
                              <div className="mx-auto max-w-[360px] overflow-hidden rounded-xl bg-white shadow-sm">
                                <img
                                  src={mediaUrl}
                                  alt="Preview Image URL"
                                  className="block h-auto w-full object-contain"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                              <p className="mt-2 text-center text-[11px] leading-4 text-slate-500">
                                Preview simulasi. Ukuran akhir mengikuti render WhatsApp di perangkat penerima.
                              </p>
                            </div>
                          ) : null}

                          <button
                            type="button"
                            onClick={importImageUrlToMeta}
                            disabled={importingMediaUrl || !cleanText(mediaUrl)}
                            className="mt-3 w-full rounded-2xl bg-cyan-600 px-5 py-3 text-sm font-black text-white hover:bg-cyan-700 disabled:opacity-60"
                          >
                            {importingMediaUrl ? 'Preparing URL...' : 'Prepare URL → Meta Media ID'}
                          </button>

                          <div className="mt-3 rounded-xl border border-cyan-100 bg-cyan-50 p-3 text-xs leading-5 text-cyan-900">
                            URL tidak dikirim sebagai link di body chat. Setelah tombol di atas berhasil,
                            Media ID otomatis terpilih dan blast tetap memakai satu IMAGE header.
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

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
            </div>

            <div className="space-y-6">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-black">Cara Blast Gambar Hemat Egress</h2>

                <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <p className="font-black">Mode hemat:</p>
                  <p className="mt-1">
                    Bisa upload file langsung atau tempel Image URL. Untuk URL, klik Prepare URL → Meta Media ID
                    lebih dulu. Notiva hanya mengambil gambar 1x, lalu blast memakai Media ID dari Meta.
                  </p>
                </div>

                <pre className="mt-4 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-cyan-50">
{`CSV cukup:
name,phone,param_1,param_2,param_3
Susi Salwa,628568032191,Susi Salwa,Suntikan ke-2,31 Juli 2026
Budi,6285137908391,Budi Santoso,Suntikan ke-2,1 Agustus 2026

Gambar:
pilih dari "Header Media via Meta Media ID" di halaman ini.`}
                </pre>

                <p className="mt-3 text-xs text-slate-500">
                  Kalau Media ID kosong, sistem masih fallback ke attachment_url/sample_url lama.
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