import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function cleanText(value) {
  return String(value || '').trim()
}

function toNumber(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return number
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

function normalizeJob(job, itemRows) {
  const jobItems = itemRows.filter((item) => cleanText(item.job_id) === cleanText(job.id))

  const countedSent = jobItems.filter((item) => isSentStatus(item.status)).length
  const countedFailed = jobItems.filter((item) => isFailedStatus(item.status)).length
  const countedPending = jobItems.filter((item) => isPendingStatus(item.status)).length

  const totalFromItems = jobItems.length
  const totalFromJob =
    toNumber(job.total_items) ||
    toNumber(job.total) ||
    toNumber(job.total_contacts) ||
    toNumber(job.count)

  const sentFromJob =
    toNumber(job.sent) ||
    toNumber(job.sent_items) ||
    toNumber(job.sent_count)

  const failedFromJob =
    toNumber(job.failed) ||
    toNumber(job.failed_items) ||
    toNumber(job.failed_count)

  const pendingFromJob =
    toNumber(job.pending) ||
    toNumber(job.pending_items) ||
    toNumber(job.pending_count)

  const total = totalFromItems || totalFromJob
  const sent = countedSent || sentFromJob
  const failed = countedFailed || failedFromJob
  const pending = countedPending || pendingFromJob || Math.max(total - sent - failed, 0)

  return {
    ...job,
    job_id: job.id,
    id: job.id,
    name: cleanText(job.name || job.title || job.job_name || 'Job'),
    title: cleanText(job.title || job.name || job.job_name || 'Job'),
    total,
    total_items: total,
    sent,
    failed,
    pending,
    item_count: totalFromItems
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    const authUser = await requireRole(req, res, ['master', 'admin', 'user', 'agent'])
    if (!authUser) return

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const limit = Number(req.query.limit || 100)

    const jobsResult = await supabaseAdmin
      .from('send_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Number.isFinite(limit) ? limit : 100)

    if (jobsResult.error) {
      return res.status(500).json({
        success: false,
        message: jobsResult.error.message
      })
    }

    const jobs = Array.isArray(jobsResult.data) ? jobsResult.data : []
    const jobIds = jobs.map((job) => job.id).filter(Boolean)

    let itemRows = []

    if (jobIds.length) {
      const itemsResult = await supabaseAdmin
        .from('send_job_items')
        .select('*')
        .in('job_id', jobIds)
        .limit(10000)

      if (itemsResult.error) {
        return res.status(500).json({
          success: false,
          message: itemsResult.error.message
        })
      }

      itemRows = Array.isArray(itemsResult.data) ? itemsResult.data : []
    }

    const rows = jobs.map((job) => normalizeJob(job, itemRows))

    return res.status(200).json({
      success: true,
      jobs: rows,
      rows,
      items: rows,
      data: rows
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memuat jobs.'
    })
  }
}