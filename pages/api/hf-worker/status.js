const DEFAULT_HF_WORKER_URL =
  process.env.HF_WORKER_URL ||
  process.env.NEXT_PUBLIC_HF_WORKER_URL ||
  'https://ai-think-wa-reminder-blast-runner.hf.space/'

function toIso(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function ageSeconds(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 1000))
}

function lower(value) {
  return String(value || '').toLowerCase()
}

function hasProblem(result) {
  if (!result || typeof result !== 'object') return false
  if (result.success === false) return true
  if (Number(result.http_status || 0) >= 400) return true
  return false
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)

  try {
    const headers = {
      Accept: 'application/json',
      'User-Agent': 'Notiva-HF-Worker-Status/2.0',
      'Cache-Control': 'no-cache',
    }

    const hfToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN
    if (hfToken) {
      headers.Authorization = `Bearer ${hfToken}`
    }

    const response = await fetch(DEFAULT_HF_WORKER_URL, {
      method: 'GET',
      headers,
      cache: 'no-store',
      signal: controller.signal,
    })

    const raw = await response.text()
    let worker = {}

    try {
      worker = raw ? JSON.parse(raw) : {}
    } catch {
      worker = { rawPreview: raw.slice(0, 500) }
    }

    const lastRunAt = toIso(worker.lastRunAt)
    const lastFinishedAt = toIso(worker.lastFinishedAt)
    const nextRunAt = toIso(worker.nextRunAt)
    const lastRunAgeSeconds = ageSeconds(lastRunAt)

    const cleanup = worker.lastCleanerResult || worker.lastCleanupResult || null
    const scheduler = worker.lastSchedulerResult || null
    const processor = worker.lastProcessorResult || null
    const template = worker.lastTemplateProcessorResult || null

    const processorText = JSON.stringify(processor || {})
    const templateText = JSON.stringify(template || {})

    const processorUnauthorized =
      Number(processor?.http_status || 0) === 401 ||
      lower(processorText).includes('unauthorized')

    const templateManualOnly =
      lower(templateText).includes('manual_only') ||
      lower(templateText).includes('auto-run generik dinonaktifkan')

    const heartbeatFresh =
      lastRunAgeSeconds !== null && lastRunAgeSeconds <= 180

    let state = 'offline'

    if (response.ok && lower(worker.status) === 'running') {
      state = heartbeatFresh ? 'online' : 'degraded'
    }

    if (
      state === 'online' &&
      (processorUnauthorized || templateManualOnly || hasProblem(scheduler))
    ) {
      state = 'degraded'
    }

    return res.status(response.ok ? 200 : 502).json({
      success: response.ok,
      state,
      checkedAt: new Date().toISOString(),
      workerUrl: DEFAULT_HF_WORKER_URL,
      keepalive: {
        enabled: true,
        provider: 'github_actions_to_notiva',
        schedule: 'every_5_minutes',
      },
      worker: {
        status: worker.status || null,
        serviceName: worker.serviceName || null,
        appUrl: worker.appUrl || null,
        intervalMs: worker.intervalMs ?? null,
        batchLimit: worker.batchLimit ?? null,
        runningTick: Boolean(worker.running),
        lastRunAt,
        lastRunAgeSeconds,
        lastFinishedAt,
        nextRunAt,
        activeTemplateRecoveryJobId:
          worker.activeTemplateRecoveryJobId || null,
      },
      diagnostics: {
        processorUnauthorized,
        templateManualOnly,
        cleanup,
        scheduler,
        processor,
        template,
      },
    })
  } catch (error) {
    const message =
      error?.name === 'AbortError'
        ? 'HF worker health timeout'
        : error?.message || 'HF worker health gagal'

    return res.status(503).json({
      success: false,
      state: 'offline',
      checkedAt: new Date().toISOString(),
      workerUrl: DEFAULT_HF_WORKER_URL,
      keepalive: {
        enabled: true,
        provider: 'github_actions_to_notiva',
        schedule: 'every_5_minutes',
      },
      message,
    })
  } finally {
    clearTimeout(timer)
  }
}
