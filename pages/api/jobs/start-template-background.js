import { waitUntil } from '@vercel/functions'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'
import {
  createBackgroundRunToken,
  getRequestBaseUrl
} from '../../../lib/templateBackgroundAuth'

const HEARTBEAT_ACTIVE_SECONDS = 120

function cleanText(value) {
  return String(value || '').trim()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function postProcessorWithRetry({ baseUrl, jobId, token }) {
  const delays = [0, 500, 1500, 3500]
  let lastError = null

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt] > 0) {
      await sleep(delays[attempt])
    }

    try {
      const response = await fetch(`${baseUrl}/api/jobs/process-template-next`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-notiva-background-token': token
        },
        body: JSON.stringify({
          job_id: jobId,
          limit: 5,
          force: 1,
          background_run: 1,
          retry_failed: 0
        })
      })

      const bodyText = await response.text()

      if (!response.ok) {
        throw new Error(
          `Background worker start HTTP ${response.status}: ${bodyText.slice(0, 300)}`
        )
      }

      return
    } catch (error) {
      lastError = error
    }
  }

  await supabaseAdmin
    .from('send_jobs')
    .update({
      background_last_error:
        `Initial background start failed after retry: ${lastError?.message || 'unknown error'}`,
      updated_at: new Date().toISOString()
    })
    .eq('id', jobId)

  throw lastError || new Error('Background worker start gagal.')
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, message: 'Method not allowed' })
    }

    const authUser = await requireRole(req, res, ['master', 'admin', 'user', 'agent'])
    if (!authUser) return

    const jobId = cleanText(req.body?.job_id || req.body?.jobId)
    if (!jobId) {
      return res.status(400).json({ success: false, message: 'job_id wajib.' })
    }

    const jobResult = await supabaseAdmin
      .from('send_jobs')
      .select(
        'id, name, status, send_mode, total_items, updated_at, ' +
        'background_run_enabled, background_started_at, background_heartbeat_at'
      )
      .eq('id', jobId)
      .single()

    if (jobResult.error || !jobResult.data) {
      return res.status(404).json({
        success: false,
        message: jobResult.error?.message || 'Job tidak ditemukan.'
      })
    }

    if (cleanText(jobResult.data.send_mode).toLowerCase() !== 'template') {
      return res.status(400).json({
        success: false,
        message: 'Background runner ini khusus Template Blast.'
      })
    }

    const pendingResult = await supabaseAdmin
      .from('send_job_items')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', jobId)
      .in('status', ['pending', 'queued'])

    if (pendingResult.error) {
      return res.status(500).json({
        success: false,
        message: pendingResult.error.message
      })
    }

    const pendingRemaining = Number(pendingResult.count || 0)
    const now = new Date().toISOString()

    if (pendingRemaining <= 0) {
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

      return res.status(200).json({
        success: true,
        started: false,
        done: true,
        job_id: jobId,
        pending_remaining: 0,
        message: 'Tidak ada pending. Job tidak perlu dijalankan lagi.'
      })
    }

    const heartbeatSource =
      jobResult.data.background_heartbeat_at ||
      jobResult.data.updated_at ||
      null

    const heartbeatMs = Date.parse(cleanText(heartbeatSource))
    const heartbeatAgeSeconds = Number.isFinite(heartbeatMs)
      ? Math.max(0, Math.floor((Date.now() - heartbeatMs) / 1000))
      : null

    const alreadyRunning =
      jobResult.data.background_run_enabled === true &&
      heartbeatAgeSeconds !== null &&
      heartbeatAgeSeconds <= HEARTBEAT_ACTIVE_SECONDS

    if (alreadyRunning) {
      return res.status(200).json({
        success: true,
        started: false,
        already_running: true,
        background_active: true,
        auto_recovery_active: true,
        job_id: jobId,
        pending_remaining: pendingRemaining,
        heartbeat_age_seconds: heartbeatAgeSeconds,
        message:
          `Background masih aktif untuk ${pendingRemaining} pending. ` +
          'Runner kedua tidak dibuat; Auto Recovery tetap aktif.'
      })
    }

    const startedAt = jobResult.data.background_started_at || now

    const markRunning = await supabaseAdmin
      .from('send_jobs')
      .update({
        status: 'processing',
        background_run_enabled: true,
        background_started_at: startedAt,
        background_heartbeat_at: now,
        background_finished_at: null,
        background_last_error: null,
        updated_at: now
      })
      .eq('id', jobId)

    if (markRunning.error) {
      return res.status(500).json({
        success: false,
        message:
          'Gagal menyimpan state background: ' +
          (markRunning.error.message || 'unknown database error')
      })
    }

    const token = createBackgroundRunToken(jobId)
    const baseUrl = getRequestBaseUrl(req)

    const backgroundRequest = postProcessorWithRetry({
      baseUrl,
      jobId,
      token
    }).catch((error) => {
      console.error('Notiva background initial start failed:', error.message)
    })

    waitUntil(backgroundRequest)

    return res.status(202).json({
      success: true,
      started: true,
      background_active: true,
      auto_recovery_active: true,
      heartbeat_at: now,
      job_id: jobId,
      pending_remaining: pendingRemaining,
      message:
        `Background aktif untuk ${pendingRemaining} pending. ` +
        'Notiva/tab browser boleh ditutup; Auto Recovery akan menjaga queue sampai pending habis.'
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memulai background runner.'
    })
  }
}
