import { waitUntil } from '@vercel/functions'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'
import {
  createBackgroundRunToken,
  getRequestBaseUrl
} from '../../../lib/templateBackgroundAuth'

function cleanText(value) {
  return String(value || '').trim()
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
      .select('id, name, status, send_mode, total_items, updated_at')
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
      return res.status(500).json({ success: false, message: pendingResult.error.message })
    }

    const pendingRemaining = Number(pendingResult.count || 0)

    const updatedAtMs = Date.parse(cleanText(jobResult.data.updated_at))
    const heartbeatAgeSeconds = Number.isFinite(updatedAtMs)
      ? Math.max(0, Math.floor((Date.now() - updatedAtMs) / 1000))
      : null
    const alreadyRunning =
      cleanText(jobResult.data.status).toLowerCase() === 'processing' &&
      pendingRemaining > 0 &&
      heartbeatAgeSeconds !== null &&
      heartbeatAgeSeconds <= 180

    if (alreadyRunning) {
      return res.status(200).json({
        success: true,
        started: false,
        already_running: true,
        background_active: true,
        job_id: jobId,
        pending_remaining: pendingRemaining,
        heartbeat_age_seconds: heartbeatAgeSeconds,
        message:
          `Background masih aktif di server untuk ${pendingRemaining} pending. ` +
          'Tidak membuat runner kedua.'
      })
    }

    if (pendingRemaining <= 0) {
      return res.status(200).json({
        success: true,
        started: false,
        done: true,
        job_id: jobId,
        pending_remaining: 0,
        message: 'Tidak ada pending. Job tidak perlu dijalankan lagi.'
      })
    }

    const heartbeatAt = new Date().toISOString()
    const markRunning = await supabaseAdmin
      .from('send_jobs')
      .update({
        status: 'processing',
        updated_at: heartbeatAt
      })
      .eq('id', jobId)

    if (markRunning.error) {
      return res.status(500).json({
        success: false,
        message:
          'Gagal menyimpan heartbeat background: ' +
          (markRunning.error.message || 'unknown database error')
      })
    }

    const token = createBackgroundRunToken(jobId)
    const baseUrl = getRequestBaseUrl(req)

    const backgroundRequest = fetch(`${baseUrl}/api/jobs/process-template-next`, {
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
      .then(async (response) => {
        await response.text()
        if (!response.ok) throw new Error(`Background worker start HTTP ${response.status}`)
      })
      .catch((error) => {
        console.error('Notiva background start failed:', error.message)
      })

    waitUntil(backgroundRequest)

    return res.status(202).json({
      success: true,
      started: true,
      job_id: jobId,
      pending_remaining: pendingRemaining,
      background_active: true,
      heartbeat_at: heartbeatAt,
      message:
        `Background aktif untuk ${pendingRemaining} pending. ` +
        'Notiva/tab browser boleh ditutup; server akan melanjutkan batch berikutnya.'
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memulai background runner.'
    })
  }
}
