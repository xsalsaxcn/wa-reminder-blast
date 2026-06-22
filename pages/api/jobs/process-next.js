import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'
import { sendWhatsAppText } from '../../../lib/whatsappSender'
import { saveDeliveryLog } from '../../../lib/sendDeliveryLog'

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

function hasAttachment(item) {
  return Boolean(cleanText(item.attachment_url))
}

function isForce(req) {
  const value = cleanText(req.query.force || req.body?.force).toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'now'
}

function isDue(item, force) {
  if (force) return true

  // Mode Sesuai Jadwal CSV:
  // scheduled_at wajib ada. Kalau kosong, tidak boleh kirim.
  if (!item.scheduled_at) return false

  const scheduledAt = new Date(item.scheduled_at)

  if (Number.isNaN(scheduledAt.getTime())) return false

  return scheduledAt <= new Date()
}

function isFuture(item, force) {
  if (force) return false

  // Kalau scheduled_at kosong, anggap belum boleh dikirim.
  if (!item.scheduled_at) return true

  const scheduledAt = new Date(item.scheduled_at)

  if (Number.isNaN(scheduledAt.getTime())) return true

  return scheduledAt > new Date()
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
    const secret = req.headers['x-worker-secret']
    const expectedSecret = process.env.WORKER_SECRET

    if (!expectedSecret || secret !== expectedSecret) {
      const authUser = await requireRole(req, res, ['master', 'admin', 'user', 'agent'])
      if (!authUser) return
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const force = isForce(req)
    const limitRaw = req.query.limit || req.body?.limit || 10
    const limit = Number(limitRaw)
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 10
    const jobId = cleanText(req.query.job_id || req.body?.job_id || req.query.jobId || req.body?.jobId)

    let query = supabaseAdmin
      .from('send_job_items')
      .select('*')
      .in('status', ['pending', 'queued'])
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

    const allPendingItems = Array.isArray(itemsResult.data) ? itemsResult.data : []
    const textCandidates = allPendingItems.filter((item) => !hasAttachment(item))
    const futureItems = textCandidates.filter((item) => isFuture(item, force))
    const textItems = textCandidates.filter((item) => isDue(item, force)).slice(0, safeLimit)

    if (!textItems.length) {
      return res.status(200).json({
        success: true,
        message: futureItems.length
          ? 'Belum ada text item yang waktunya due. Semua masih menunggu scheduled_at.'
          : 'Tidak ada text item pending untuk diproses.',
        mode: force ? 'now' : 'scheduled',
        checked: allPendingItems.length,
        future_items: futureItems.length,
        processed: 0,
        sent: 0,
        failed: 0,
        skipped_attachment: allPendingItems.filter(hasAttachment).length
      })
    }

    let sent = 0
    let failed = 0
    const results = []
    const affectedJobIds = new Set()

    for (const item of textItems) {
      const itemId = item.id
      const itemJobId = item.job_id
      const phone = cleanPhone(item.phone)
      const message = cleanText(item.message)

      affectedJobIds.add(itemJobId)

      if (!itemId || !phone || !message) {
        await updateItemSafe(itemId, {
          status: 'failed',
          processed_at: new Date().toISOString(),
          error_message: 'Phone atau message kosong.'
        })

        await saveDeliveryLog({
          job_id: itemJobId,
          item_id: itemId,
          phone,
          message,
          status: 'failed',
          mode: 'text',
          error_message: 'Phone atau message kosong.'
        })

        failed += 1

        results.push({
          id: itemId,
          phone,
          success: false,
          error: 'Phone atau message kosong.'
        })

        continue
      }

      await updateItemSafe(itemId, {
        status: 'processing',
        error_message: null
      })

      try {
        const sendResult = await sendWhatsAppText({
          to: phone,
          message
        })

        await updateItemSafe(itemId, {
          status: 'sent',
          processed_at: new Date().toISOString(),
          error_message: null
        })

        await saveDeliveryLog({
          job_id: itemJobId,
          item_id: itemId,
          phone,
          message,
          status: 'success',
          mode: 'text',
          meta_response: sendResult || null
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
          error_message: error.message || 'Gagal kirim WhatsApp.'
        })

        await saveDeliveryLog({
          job_id: itemJobId,
          item_id: itemId,
          phone,
          message,
          status: 'failed',
          mode: 'text',
          error_message: error.message || 'Gagal kirim WhatsApp.'
        })

        failed += 1

        results.push({
          id: itemId,
          phone,
          success: false,
          error: error.message || 'Gagal kirim WhatsApp.'
        })
      }
    }

    for (const affectedJobId of affectedJobIds) {
      await updateJobSafe(affectedJobId)
    }

    return res.status(200).json({
      success: true,
      message: 'Process text batch selesai.',
      mode: force ? 'now' : 'scheduled',
      checked: allPendingItems.length,
      future_items: futureItems.length,
      processed: textItems.length,
      sent,
      failed,
      skipped_attachment: allPendingItems.filter(hasAttachment).length,
      results
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Process text batch gagal.'
    })
  }
}