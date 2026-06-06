New-Item -ItemType Directory -Force -Path "pages\api\admin" | Out-Null
New-Item -ItemType Directory -Force -Path "huggingface-runner" | Out-Null

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function isRunnerAuthorized(req) {
  const expected = process.env.JOB_RUNNER_SECRET
  const headerSecret = req.headers['x-job-runner-secret']
  const querySecret = req.query.secret

  if (!expected) return false

  return headerSecret === expected || querySecret === expected
}

function hoursAgoIso(hours) {
  return new Date(Date.now() - Number(hours) * 60 * 60 * 1000).toISOString()
}

function daysAgoIso(days) {
  return new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString()
}

async function getLastCleanupRun() {
  const { data, error } = await supabaseAdmin
    .from('maintenance_runs')
    .select('*')
    .eq('name', 'auto_cleanup')
    .eq('status', 'success')
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) throw error

  return data?.[0] || null
}

async function shouldRunCleanup() {
  const enabled = String(process.env.AUTO_CLEANUP_ENABLED || 'true') === 'true'

  if (!enabled) {
    return {
      shouldRun: false,
      reason: 'Auto cleanup disabled'
    }
  }

  const intervalHours = Number(process.env.AUTO_CLEANUP_INTERVAL_HOURS || 24)
  const lastRun = await getLastCleanupRun()

  if (!lastRun) {
    return {
      shouldRun: true,
      reason: 'No previous cleanup run'
    }
  }

  const cutoff = hoursAgoIso(intervalHours)

  if (lastRun.created_at < cutoff) {
    return {
      shouldRun: true,
      reason: `Last cleanup older than ${intervalHours} hours`
    }
  }

  return {
    shouldRun: false,
    reason: `Cleanup already ran within ${intervalHours} hours`,
    lastRun
  }
}

async function deleteOldLogs(days) {
  const cutoff = daysAgoIso(days)

  const reminderResult = await supabaseAdmin
    .from('reminder_logs')
    .delete()
    .lt('sent_at', cutoff)

  if (reminderResult.error) throw reminderResult.error

  const blastResult = await supabaseAdmin
    .from('blast_logs')
    .delete()
    .lt('sent_at', cutoff)

  if (blastResult.error) throw blastResult.error

  return cutoff
}

async function deleteOldJobs(days) {
  const cutoff = daysAgoIso(days)

  const { error } = await supabaseAdmin
    .from('send_jobs')
    .delete()
    .in('status', ['done', 'failed'])
    .lt('updated_at', cutoff)

  if (error) throw error

  return cutoff
}

async function insertMaintenanceRun({ status, message, meta }) {
  await supabaseAdmin
    .from('maintenance_runs')
    .insert({
      name: 'auto_cleanup',
      status,
      message,
      meta: meta || {}
    })
}

export default async function handler(req, res) {
  const isRunner = isRunnerAuthorized(req)

  if (!isRunner) {
    const authUser = requireRole(req, res, ['master'])
    if (!authUser) return
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const check = await shouldRunCleanup()

    if (!check.shouldRun) {
      return res.status(200).json({
        success: true,
        skipped: true,
        message: check.reason,
        lastRun: check.lastRun || null
      })
    }

    const logRetentionDays =
      req.query.logRetentionDays ||
      req.body?.logRetentionDays ||
      process.env.LOG_RETENTION_DAYS ||
      90

    const jobRetentionDays =
      req.query.jobRetentionDays ||
      req.body?.jobRetentionDays ||
      process.env.JOB_RETENTION_DAYS ||
      30

    const logCutoff = await deleteOldLogs(logRetentionDays)
    const jobCutoff = await deleteOldJobs(jobRetentionDays)

    const message = `Auto cleanup selesai. Logs > ${logRetentionDays} hari dan jobs selesai > ${jobRetentionDays} hari dihapus.`

    await insertMaintenanceRun({
      status: 'success',
      message,
      meta: {
        logRetentionDays: Number(logRetentionDays),
        jobRetentionDays: Number(jobRetentionDays),
        logCutoff,
        jobCutoff
      }
    })

    return res.status(200).json({
      success: true,
      skipped: false,
      message,
      logRetentionDays: Number(logRetentionDays),
      jobRetentionDays: Number(jobRetentionDays),
      logCutoff,
      jobCutoff
    })
  } catch (error) {
    await insertMaintenanceRun({
      status: 'failed',
      message: error.message || 'Auto cleanup gagal',
      meta: {}
    })

    return res.status(500).json({
      success: false,
      message: error.message || 'Auto cleanup gagal'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\admin\auto-cleanup.js"

@'
import http from 'http'

const APP_URL = process.env.APP_URL
const JOB_RUNNER_SECRET = process.env.JOB_RUNNER_SECRET
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 15000)
const JOB_TYPE = process.env.JOB_TYPE || ''
const JOB_BATCH_LIMIT = process.env.JOB_BATCH_LIMIT || '10'
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

    console.log(lastRunAt, JSON.stringify({
      cleanup: lastCleanupResult,
      scheduler: lastSchedulerResult,
      processor: lastProcessorResult
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
    lastProcessorResult
  }, null, 2))
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Health server running on port ${PORT}`)
  console.log('WA Reminder Blast Auto Worker started')
  console.log('APP_URL:', APP_URL)
  console.log('INTERVAL_MS:', INTERVAL_MS)
  console.log('JOB_TYPE:', JOB_TYPE || 'all')
  console.log('JOB_BATCH_LIMIT:', JOB_BATCH_LIMIT)

  tick()
  setInterval(tick, INTERVAL_MS)
})
'@ | Set-Content -Encoding UTF8 "huggingface-runner\index.js"

Write-Host "Auto cleanup setup selesai."