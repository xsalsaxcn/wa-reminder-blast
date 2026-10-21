import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import {
  createBackgroundRunToken,
  getRequestBaseUrl
} from '../../../lib/templateBackgroundAuth'

const STALE_SECONDS = 90
const MAX_RECOVERIES_PER_RUN = 3

function cleanText(value) {
  return String(value || '').trim()
}

function isAuthorizedCron(req) {
  const cronSecret = cleanText(process.env.CRON_SECRET)
  const authHeader = cleanText(req.headers.authorization)

  if (cronSecret) {
    return authHeader === `Bearer ${cronSecret}`
  }

  // Vercel Cron uses this user agent. Without CRON_SECRET this route still
  // only resumes jobs explicitly marked background_run_enabled=true.
  const userAgent = cleanText(req.headers['user-agent']).toLowerCase()
  return userAgent.startsWith('vercel-cron/')
}

async function countPending(jobId) {
  const result = await supabaseAdmin
    .from('send_job_items')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', jobId)
    .in('status', ['pending', 'queued'])

  if (result.error) {
    throw new Error(result.error.message)
  }

  return Number(result.count || 0)
}

async function markFinished(jobId) {
  const now = new Date().toISOString()

  await supabaseAdmin
    .from('send_jobs')
    .update({
      background_run_enabled: false,
      background_heartbeat_at: now,
      background_finished_at: now,
      background_last_error: null,
      updated_at: now
    })
    .eq('id', jobId)
}

async function acquireRecoveryLease(job) {
  const now = new Date().toISOString()
  let query = supabaseAdmin
    .from('send_jobs')
    .update({
      background_heartbeat_at: now,
      updated_at: now,
      background_recovery_count:
        Number(job.background_recovery_count || 0) + 1,
      background_last_error: null
    })
    .eq('id', job.id)
    .eq('background_run_enabled', true)

  if (job.background_heartbeat_at) {
    query = query.eq(
      'background_heartbeat_at',
      job.background_heartbeat_at
    )
  } else {
    query = query.is('background_heartbeat_at', null)
  }

  const result = await query.select('id')

  if (result.error) {
    throw new Error(result.error.message)
  }

  return Array.isArray(result.data) && result.data.length === 1
}

async function recoverJob(req, job) {
  const pending = await countPending(job.id)

  if (pending <= 0) {
    await markFinished(job.id)
    return {
      job_id: job.id,
      action: 'finished',
      pending: 0
    }
  }

  const heartbeatSource =
    job.background_heartbeat_at ||
    job.updated_at ||
    job.background_started_at ||
    job.created_at ||
    null

  const heartbeatMs = Date.parse(cleanText(heartbeatSource))
  const heartbeatAgeSeconds = Number.isFinite(heartbeatMs)
    ? Math.max(0, Math.floor((Date.now() - heartbeatMs) / 1000))
    : Number.POSITIVE_INFINITY

  if (heartbeatAgeSeconds <= STALE_SECONDS) {
    return {
      job_id: job.id,
      action: 'healthy',
      pending,
      heartbeat_age_seconds: heartbeatAgeSeconds
    }
  }

  const leased = await acquireRecoveryLease(job)

  if (!leased) {
    return {
      job_id: job.id,
      action: 'lease_skipped',
      pending
    }
  }

  const token = createBackgroundRunToken(job.id)
  const baseUrl = getRequestBaseUrl(req)

  try {
    const response = await fetch(
      `${baseUrl}/api/jobs/process-template-next`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-notiva-background-token': token
        },
        body: JSON.stringify({
          job_id: job.id,
          limit: 5,
          force: 1,
          background_run: 1,
          retry_failed: 0
        })
      }
    )

    const responseText = await response.text()

    if (!response.ok) {
      throw new Error(
        `Recovery HTTP ${response.status}: ${responseText.slice(0, 300)}`
      )
    }

    return {
      job_id: job.id,
      action: 'recovered',
      pending,
      heartbeat_age_seconds: heartbeatAgeSeconds
    }
  } catch (error) {
    await supabaseAdmin
      .from('send_jobs')
      .update({
        background_last_error:
          `Auto Recovery failed: ${error.message || 'unknown error'}`
      })
      .eq('id', job.id)

    return {
      job_id: job.id,
      action: 'recovery_failed',
      pending,
      error: error.message || 'unknown error'
    }
  }
}

export default async function handler(req, res) {
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  )

  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    if (!isAuthorizedCron(req)) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized background supervisor request.'
      })
    }

    const jobsResult = await supabaseAdmin
      .from('send_jobs')
      .select(
        'id, status, send_mode, created_at, updated_at, ' +
        'background_run_enabled, background_started_at, ' +
        'background_heartbeat_at, background_recovery_count'
      )
      .eq('send_mode', 'template')
      .eq('background_run_enabled', true)
      .order('background_heartbeat_at', {
        ascending: true,
        nullsFirst: true
      })
      .limit(20)

    if (jobsResult.error) {
      throw new Error(jobsResult.error.message)
    }

    const jobs = Array.isArray(jobsResult.data)
      ? jobsResult.data
      : []

    const results = []
    let recovered = 0

    for (const job of jobs) {
      if (recovered >= MAX_RECOVERIES_PER_RUN) break

      const result = await recoverJob(req, job)
      results.push(result)

      if (result.action === 'recovered') {
        recovered += 1
      }
    }

    return res.status(200).json({
      success: true,
      supervisor: 'notiva-template-background',
      stale_seconds: STALE_SECONDS,
      checked: jobs.length,
      recovered,
      results,
      executed_at: new Date().toISOString()
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message:
        error.message ||
        'Background supervisor gagal.'
    })
  }
}
