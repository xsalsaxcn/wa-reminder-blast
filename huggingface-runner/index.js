import http from 'http'

const APP_URL = process.env.APP_URL
const JOB_RUNNER_SECRET = process.env.JOB_RUNNER_SECRET
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 15000)
const JOB_TYPE = process.env.JOB_TYPE || ''
const JOB_BATCH_LIMIT = process.env.JOB_BATCH_LIMIT || '10'
const TEMPLATE_RECOVERY_STALE_SECONDS = 120
const TEMPLATE_RECOVERY_MAX_BATCHES = 10
const REQUEST_TIMEOUT_MS = 60000
const PORT = Number(process.env.PORT || 7860)

if (!APP_URL) {
  console.error('APP_URL is required')
  process.exit(1)
}

if (!JOB_RUNNER_SECRET) {
  console.error('JOB_RUNNER_SECRET is required')
  process.exit(1)
}

let running = false
let lastRunAt = null
let lastFinishedAt = null
let nextRunAt = null
let lastSchedulerResult = null
let lastProcessorResult = null
let lastTemplateProcessorResult = null
let activeTemplateRecoveryJobId = ''
let lastCleanupResult = null

async function callEndpoint(path, params = {}) {
  const url = new URL(path, APP_URL)

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value)
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const startedAt = Date.now()

  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'x-job-runner-secret': JOB_RUNNER_SECRET,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    })

    const raw = await response.text()
    let data = {}

    if (raw) {
      try {
        data = JSON.parse(raw)
      } catch (error) {
        data = {
          success: false,
          message: `HTTP ${response.status}: response bukan JSON`,
          response_preview: raw.slice(0, 300)
        }
      }
    }

    if (!response.ok) {
      return {
        ...data,
        success: false,
        http_status: response.status,
        duration_ms: Date.now() - startedAt
      }
    }

    return {
      ...data,
      http_status: response.status,
      duration_ms: Date.now() - startedAt
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Timeout ${REQUEST_TIMEOUT_MS}ms saat memanggil ${path}`)
    }

    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function callEndpointSafe(path, params = {}) {
  try {
    return await callEndpoint(path, params)
  } catch (error) {
    return {
      success: false,
      message: error.message || `Gagal memanggil ${path}`,
      endpoint: path,
      failed_at: new Date().toISOString()
    }
  }
}

async function processTemplateRecovery() {
  let totalProcessed = 0
  let totalSent = 0
  let totalFailed = 0
  let last = null

  try {
    for (let batch = 0; batch < TEMPLATE_RECOVERY_MAX_BATCHES; batch += 1) {
      const params = activeTemplateRecoveryJobId
        ? {
            job_id: activeTemplateRecoveryJobId,
            limit: '10',
            force: '1'
          }
        : {
            limit: '10',
            resume_stalled: '1',
            stale_seconds: String(TEMPLATE_RECOVERY_STALE_SECONDS)
          }

      const result = await callEndpoint('/api/jobs/process-template-next', params)
      last = result

      if (!result?.success) {
        return {
          success: false,
          active_job_id: activeTemplateRecoveryJobId || null,
          processed: totalProcessed,
          sent: totalSent,
          failed: totalFailed,
          last: result
        }
      }

      if (!activeTemplateRecoveryJobId && result.resumed_job_id) {
        activeTemplateRecoveryJobId = result.resumed_job_id
      }

      const processed = Number(result.processed || 0)
      totalProcessed += processed
      totalSent += Number(result.sent || 0)
      totalFailed += Number(result.failed || 0)

      if (processed <= 0) {
        activeTemplateRecoveryJobId = ''
        break
      }
    }

    return {
      success: true,
      active_job_id: activeTemplateRecoveryJobId || null,
      processed: totalProcessed,
      sent: totalSent,
      failed: totalFailed,
      last
    }
  } catch (error) {
    return {
      success: false,
      active_job_id: activeTemplateRecoveryJobId || null,
      processed: totalProcessed,
      sent: totalSent,
      failed: totalFailed,
      message: error.message || 'Template recovery gagal.',
      last
    }
  }
}

async function tick() {
  if (running) {
    console.log('Previous tick still running, skip.')
    return
  }

  running = true

  try {
    lastRunAt = new Date().toISOString()

    // Tiap endpoint non-template diisolasi. Jika cleanup/scheduler/normal worker
    // timeout atau error, Template Recovery tetap harus mendapat kesempatan jalan.
    lastCleanupResult = await callEndpointSafe('/api/admin/auto-cleanup')

    lastSchedulerResult = await callEndpointSafe('/api/scheduler/create-due-reminder-job', {
      limit: JOB_BATCH_LIMIT
    })

    lastProcessorResult = await callEndpointSafe('/api/jobs/process-next', {
      type: JOB_TYPE,
      limit: JOB_BATCH_LIMIT
    })

    // Template Blast recovery dibuat MANUAL-ONLY. Runner tidak lagi
    // mengirim job template lama/stuck secara otomatis.
    activeTemplateRecoveryJobId = ''
    lastTemplateProcessorResult = {
      success: true,
      skipped: true,
      mode: 'manual_only',
      message: 'Auto Template Recovery dinonaktifkan. Gunakan Manual Run di Job Performance.',
      processed: 0,
      sent: 0,
      failed: 0
    }

    console.log(lastRunAt, JSON.stringify({
      cleanup: lastCleanupResult,
      scheduler: lastSchedulerResult,
      processor: lastProcessorResult,
      templateRecovery: lastTemplateProcessorResult
    }))
  } catch (error) {
    lastProcessorResult = {
      success: false,
      message: error.message
    }

    console.error(new Date().toISOString(), error.message)
  } finally {
    running = false
    lastFinishedAt = new Date().toISOString()
  }
}

let loopTimer = null

function scheduleNextTick(delayMs = INTERVAL_MS) {
  if (loopTimer) clearTimeout(loopTimer)

  nextRunAt = new Date(Date.now() + delayMs).toISOString()
  loopTimer = setTimeout(async () => {
    loopTimer = null
    nextRunAt = null

    try {
      await tick()
    } finally {
      scheduleNextTick(INTERVAL_MS)
    }
  }, delayMs)
}

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json')

  res.end(JSON.stringify({
    status: 'running',
    serviceName: 'WA Reminder Blast Auto Worker',
    appUrl: APP_URL,
    intervalMs: INTERVAL_MS,
    jobType: JOB_TYPE || 'all',
    batchLimit: JOB_BATCH_LIMIT,
    running,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    lastRunAt,
    lastFinishedAt,
    nextRunAt,
    lastCleanupResult,
    lastSchedulerResult,
    lastProcessorResult,
    lastTemplateProcessorResult,
    activeTemplateRecoveryJobId: activeTemplateRecoveryJobId || null
  }, null, 2))
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Health server running on port ${PORT}`)
  console.log('WA Reminder Blast Auto Worker started')
  console.log('APP_URL:', APP_URL)
  console.log('INTERVAL_MS:', INTERVAL_MS)
  console.log('JOB_TYPE:', JOB_TYPE || 'all')
  console.log('JOB_BATCH_LIMIT:', JOB_BATCH_LIMIT)
  console.log('TEMPLATE_RECOVERY_STALE_SECONDS:', TEMPLATE_RECOVERY_STALE_SECONDS)
  console.log('TEMPLATE_RECOVERY_MAX_BATCHES:', TEMPLATE_RECOVERY_MAX_BATCHES)
  console.log('REQUEST_TIMEOUT_MS:', REQUEST_TIMEOUT_MS)

  tick()
    .catch((error) => {
      console.error(new Date().toISOString(), error.message)
    })
    .finally(() => {
      scheduleNextTick(INTERVAL_MS)
    })
})
