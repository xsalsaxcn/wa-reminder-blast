import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'
import { saveDeliveryLog } from '../../../lib/sendDeliveryLog'
import { sendWhatsAppTemplate } from '../../../lib/whatsappTemplateSender'

function cleanText(value) {
  return String(value || '').trim()
}

function cleanPhone(value) {
  let phone = String(value || '').trim()
  let result = ''

  if (phone.startsWith('="')) phone = phone.slice(2)
  if (phone.endsWith('"')) phone = phone.slice(0, -1)
  if (phone.startsWith("'")) phone = phone.slice(1)

  for (const char of phone) {
    if ('0123456789'.includes(char)) result += char
  }

  if (result.startsWith('0')) result = '62' + result.slice(1)

  return result
}

function isForce(req) {
  const value = cleanText(req.query.force || req.body?.force).toLowerCase()
  return value === '1'
}

function isManualRun(req) {
  const value = cleanText(
    req.query.manual_run ||
    req.body?.manual_run ||
    req.query.manualRun ||
    req.body?.manualRun
  ).toLowerCase()

  return ['1', 'true', 'yes'].includes(value)
}

function isResumeStalled(req) {
  const value = cleanText(
    req.query.resume_stalled ||
    req.body?.resume_stalled ||
    req.query.resumeStalled ||
    req.body?.resumeStalled
  ).toLowerCase()

  return ['1', 'true', 'yes'].includes(value)
}

function getResumeStaleSeconds(req) {
  const raw = req.query.stale_seconds || req.body?.stale_seconds || 120
  const value = Number(raw)

  if (!Number.isFinite(value) || value < 60) return 120

  return Math.min(value, 3600)
}

function isWorkerOrRunnerAuthorized(req) {
  const workerSecret = cleanText(req.headers['x-worker-secret'])
  const expectedWorkerSecret = cleanText(process.env.WORKER_SECRET)

  if (expectedWorkerSecret && workerSecret === expectedWorkerSecret) {
    return true
  }

  const runnerSecret = cleanText(req.headers['x-job-runner-secret'])
  const expectedRunnerSecret = cleanText(process.env.JOB_RUNNER_SECRET)

  if (expectedRunnerSecret && runnerSecret === expectedRunnerSecret) {
    return true
  }

  return false
}

async function findStalledTemplateJob(req) {
  const staleSeconds = getResumeStaleSeconds(req)
  const cutoffMs = Date.now() - staleSeconds * 1000

  const result = await supabaseAdmin
    .from('send_jobs')
    .select('id, status, send_mode, created_at, updated_at')
    .eq('send_mode', 'template')
    .eq('status', 'processing')
    .order('created_at', { ascending: true })
    .limit(100)

  if (result.error) {
    return {
      error: result.error,
      staleSeconds,
      job: null
    }
  }

  const jobs = Array.isArray(result.data) ? result.data : []
  const job = jobs.find((item) => {
    const reference = item.updated_at || item.created_at
    const timestamp = new Date(reference || '').getTime()

    return Number.isFinite(timestamp) && timestamp <= cutoffMs
  }) || null

  return {
    error: null,
    staleSeconds,
    job
  }
}

function isDue(item, force) {
  if (force) return true
  if (!item.scheduled_at) return false

  const scheduledAt = new Date(item.scheduled_at)

  if (Number.isNaN(scheduledAt.getTime())) return false

  return scheduledAt <= new Date()
}

function isFuture(item, force) {
  if (force) return false
  if (!item.scheduled_at) return true

  const scheduledAt = new Date(item.scheduled_at)

  if (Number.isNaN(scheduledAt.getTime())) return true

  return scheduledAt > new Date()
}

function normalizeParams(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean)

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map(cleanText).filter(Boolean)
    } catch (error) {
      return value.split('|').map(cleanText).filter(Boolean)
    }
  }

  return []
}

async function saveOutgoingHistorySafe({ phone, message, metaMessageId, sentAt }) {
  try {
    if (!phone || !message) return

    if (metaMessageId) {
      const existing = await supabaseAdmin
        .from('wa_outgoing_messages')
        .select('id')
        .eq('meta_message_id', metaMessageId)
        .limit(1)

      if (!existing.error && Array.isArray(existing.data) && existing.data.length) {
        return
      }
    }

    const insertResult = await supabaseAdmin
      .from('wa_outgoing_messages')
      .insert({
        phone,
        message,
        status: 'sent',
        meta_message_id: metaMessageId || null,
        message_type: 'template',
        sent_at: sentAt,
        created_at: sentAt
      })

    if (insertResult.error) {
      console.error('saveOutgoingHistorySafe failed:', insertResult.error.message)
    }
  } catch (error) {
    // History snapshot tidak boleh menggagalkan pengiriman WhatsApp yang sudah sukses.
    console.error('saveOutgoingHistorySafe failed:', error.message)
  }
}

function isSentStatus(status) {
  const text = cleanText(status).toLowerCase()
  return ['sent', 'delivered', 'read', 'success', 'completed', 'done'].includes(text)
}

function isFailedStatus(status) {
  const text = cleanText(status).toLowerCase()
  return ['failed', 'error', 'cancelled'].includes(text)
}

function isPendingStatus(status) {
  const text = cleanText(status).toLowerCase()
  return ['pending', 'queued', 'processing'].includes(text)
}

async function updateItemSafe(itemId, payload) {
  const fullPayload = {
    ...payload,
    updated_at: new Date().toISOString()
  }

  const first = await supabaseAdmin
    .from('send_job_items')
    .update(fullPayload)
    .eq('id', itemId)

  if (!first.error) return first

  const minimalPayload = {}

  if (payload.status !== undefined) minimalPayload.status = payload.status
  if (payload.error_message !== undefined) minimalPayload.error_message = payload.error_message
  if (payload.processed_at !== undefined) minimalPayload.processed_at = payload.processed_at

  return supabaseAdmin
    .from('send_job_items')
    .update(minimalPayload)
    .eq('id', itemId)
}

async function updateJobSafe(jobId) {
  if (!jobId) return

  const itemsResult = await supabaseAdmin
    .from('send_job_items')
    .select('id, status')
    .eq('job_id', jobId)
    .limit(10000)

  if (itemsResult.error) return

  const items = Array.isArray(itemsResult.data) ? itemsResult.data : []

  const total = items.length
  const sent = items.filter((item) => isSentStatus(item.status)).length
  const failed = items.filter((item) => isFailedStatus(item.status)).length
  const pending = items.filter((item) => isPendingStatus(item.status)).length

  let nextStatus = 'pending'

  if (total > 0 && pending === 0) {
    nextStatus = failed > 0 && sent === 0 ? 'failed' : 'done'
  } else if (sent > 0 || failed > 0) {
    nextStatus = 'processing'
  }

  const fullUpdate = {
    status: nextStatus,
    total_items: total,
    sent,
    failed,
    updated_at: new Date().toISOString()
  }

  const first = await supabaseAdmin
    .from('send_jobs')
    .update(fullUpdate)
    .eq('id', jobId)

  if (!first.error) return

  await supabaseAdmin
    .from('send_jobs')
    .update({
      status: nextStatus
    })
    .eq('id', jobId)
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const manualRun = isManualRun(req)

    // HARD KILL-SWITCH: seluruh pemrosesan Template Blast background/non-manual
    // dibuat NO-OP. Ini menghentikan cron lama, HF runner lama/baru, dan tab
    // Template Blast lama yang masih mencoba melanjutkan job secara otomatis.
    // Hanya tombol Manual Run dari user login yang boleh mengirim.
    if (!manualRun) {
      return res.status(200).json({
        success: true,
        skipped: true,
        message: 'Template Blast auto-run dinonaktifkan. Gunakan Manual Run di Job Performance.',
        mode: 'manual_only',
        processed: 0,
        sent: 0,
        failed: 0
      })
    }

    // Manual Run wajib berasal dari session user, bukan worker secret.
    const authUser = await requireRole(req, res, ['master', 'admin', 'user', 'agent'])
    if (!authUser) return

    const force = true
    const limitRaw = req.query.limit || req.body?.limit || 50
    const limit = Number(limitRaw)
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 50
    let jobId = cleanText(req.query.job_id || req.body?.job_id || req.query.jobId || req.body?.jobId)
    const resumeStalled = false
    let resumedJob = null
    let staleSeconds = null

    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: 'job_id wajib untuk Manual Run Template Blast.'
      })
    }

    // Legacy recovery code di bawah tetap dipertahankan sebagai safety history,
    // tetapi tidak akan tercapai selama mode manual-only aktif.
    // Recovery ini hanya memilih job template yang SUDAH processing tetapi
    // berhenti bergerak. Job pending/future tidak diambil, sehingga flow
    // scheduler/template yang sudah benar tetap berjalan seperti sebelumnya.
    if (!jobId && resumeStalled) {
      const stalledResult = await findStalledTemplateJob(req)
      staleSeconds = stalledResult.staleSeconds

      if (stalledResult.error) {
        return res.status(500).json({
          success: false,
          message: stalledResult.error.message || 'Gagal mencari template job yang stale.'
        })
      }

      if (!stalledResult.job?.id) {
        return res.status(200).json({
          success: true,
          message: 'Tidak ada template job stale yang perlu dilanjutkan.',
          mode: 'resume_stalled',
          resumed_job_id: null,
          stale_seconds: staleSeconds,
          processed: 0,
          sent: 0,
          failed: 0
        })
      }

      resumedJob = stalledResult.job
      jobId = cleanText(resumedJob.id)
    }

    const effectiveForce = force || Boolean(resumedJob)

    let query = supabaseAdmin
      .from('send_job_items')
      .select('*')
      .in('status', ['pending', 'queued'])
      .not('template_name', 'is', null)
      .order('created_at', { ascending: true })
      .limit(500)

    if (jobId) query = query.eq('job_id', jobId)

    const itemsResult = await query

    if (itemsResult.error) {
      return res.status(500).json({
        success: false,
        message: itemsResult.error.message
      })
    }

    const allItems = Array.isArray(itemsResult.data) ? itemsResult.data : []
    const futureItems = allItems.filter((item) => isFuture(item, effectiveForce))
    const dueItems = allItems.filter((item) => isDue(item, effectiveForce)).slice(0, safeLimit)

    if (!dueItems.length) {
      if (resumedJob?.id) {
        await updateJobSafe(resumedJob.id)
      }

      return res.status(200).json({
        success: true,
        message: futureItems.length
          ? 'Belum ada template item yang waktunya due.'
          : 'Tidak ada template item pending untuk diproses.',
        mode: resumedJob ? 'resume_stalled' : (force ? 'now' : 'scheduled'),
        resumed_job_id: resumedJob?.id || null,
        stale_seconds: staleSeconds,
        checked: allItems.length,
        future_items: futureItems.length,
        processed: 0,
        sent: 0,
        failed: 0
      })
    }

    let sent = 0
    let failed = 0
    const results = []
    const affectedJobIds = new Set()

    for (const item of dueItems) {
      const itemId = item.id
      const itemJobId = item.job_id
      const phone = cleanPhone(item.phone)
      const message = cleanText(item.message)
      const params = normalizeParams(item.template_params)

      affectedJobIds.add(itemJobId)

      await updateItemSafe(itemId, {
        status: 'processing',
        error_message: null
      })

      try {
        const sendResult = await sendWhatsAppTemplate({
          to: phone,
          templateName: item.template_name,
          language: item.template_language || 'id',
          headerType: item.template_header_type || 'NONE',
          headerMediaId: item.header_media_id || '',
          attachmentUrl: item.attachment_url || '',
          attachmentFilename: item.header_media_filename || item.attachment_filename || '',
          params
        })

        const sentAt = new Date().toISOString()

        await updateItemSafe(itemId, {
          status: 'sent',
          processed_at: sentAt,
          error_message: null
        })

        await saveDeliveryLog({
          job_id: itemJobId,
          item_id: itemId,
          phone,
          message,
          status: 'success',
          mode: 'template',
          meta_response: sendResult || null
        })

        await saveOutgoingHistorySafe({
          phone,
          message,
          metaMessageId: sendResult?.meta_message_id || null,
          sentAt
        })

        sent += 1

        results.push({
          id: itemId,
          phone,
          success: true,
          result: sendResult || null
        })
      } catch (error) {
        await updateItemSafe(itemId, {
          status: 'failed',
          processed_at: new Date().toISOString(),
          error_message: error.message || 'Gagal kirim template WhatsApp.'
        })

        await saveDeliveryLog({
          job_id: itemJobId,
          item_id: itemId,
          phone,
          message,
          status: 'failed',
          mode: 'template',
          error_message: error.message || 'Gagal kirim template WhatsApp.'
        })

        failed += 1

        results.push({
          id: itemId,
          phone,
          success: false,
          error: error.message || 'Gagal kirim template WhatsApp.'
        })
      }
    }

    for (const affectedJobId of affectedJobIds) {
      await updateJobSafe(affectedJobId)
    }

    return res.status(200).json({
      success: true,
      message: 'Process template batch selesai.',
      mode: resumedJob ? 'resume_stalled' : (force ? 'now' : 'scheduled'),
      resumed_job_id: resumedJob?.id || null,
      stale_seconds: staleSeconds,
      checked: allItems.length,
      future_items: futureItems.length,
      processed: dueItems.length,
      sent,
      failed,
      results
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Process template batch gagal.'
    })
  }
}