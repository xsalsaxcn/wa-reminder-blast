import http from 'http'

const APP_URL = process.env.APP_URL
const JOB_RUNNER_SECRET = process.env.JOB_RUNNER_SECRET
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 15000)
const JOB_TYPE = process.env.JOB_TYPE || ''
const JOB_BATCH_LIMIT = process.env.JOB_BATCH_LIMIT || '10'
const TEMPLATE_RECOVERY_STALE_SECONDS = 120
const TEMPLATE_RECOVERY_MAX_BATCHES = 10
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

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'x-job-runner-secret': JOB_RUNNER_SECRET,
      'Content-Type': 'application/json'
    }
  })

  return response.json()
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

    lastCleanupResult = await callEndpoint('/api/admin/auto-cleanup')

    lastSchedulerResult = await callEndpoint('/api/scheduler/create-due-reminder-job', {
      limit: JOB_BATCH_LIMIT
    })

    lastProcessorResult = await callEndpoint('/api/jobs/process-next', {
      type: JOB_TYPE,
      limit: JOB_BATCH_LIMIT
    })

    // Template Blast normal tetap diproses oleh halaman admin.
    // Runner hanya mengambil alih job yang sudah processing tetapi stale.
    lastTemplateProcessorResult = await processTemplateRecovery()

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
  }
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
    lastRunAt,
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

  tick()
  setInterval(tick, INTERVAL_MS)
})
