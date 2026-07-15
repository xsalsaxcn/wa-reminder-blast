import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function cleanText(value) {
  return String(value || '').trim()
}

function cleanPhone(value) {
  let phone = String(value || '').trim()
  let result = ''

  if (phone.startsWith('="')) phone = phone.slice(2)
  if (phone.endsWith('"')) phone = phone.slice(0, -1)
  if (phone.startsWith("'")) phone = phone.slice(1)
  if (phone.startsWith('+')) phone = phone.slice(1)

  for (const char of phone) {
    if ('0123456789'.includes(char)) result += char
  }

  if (result.startsWith('0')) result = '62' + result.slice(1)

  return result
}

function toPage(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 1) return 1
  return Math.floor(number)
}

function toLimit(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return 500
  return Math.min(1000, Math.max(50, Math.floor(number)))
}

function normalizeStatus(value) {
  const text = cleanText(value).toLowerCase()

  if (['sent', 'success', 'delivered', 'read', 'done', 'completed'].includes(text)) return 'sent'
  if (['failed', 'error', 'undelivered', 'rejected', 'cancelled'].includes(text)) return 'failed'
  if (['pending', 'queued', 'processing'].includes(text)) return text

  return text || 'unknown'
}

function getDisplayTime(item) {
  return item.sent_at || item.processed_at || item.updated_at || item.created_at || item.scheduled_at || null
}

function getFailedReason(item) {
  return (
    cleanText(item.error_message) ||
    cleanText(item.failed_reason) ||
    cleanText(item.error) ||
    cleanText(item.meta_error) ||
    cleanText(item.reason) ||
    ''
  )
}

function uniqueValues(rows, key) {
  return Array.from(
    new Set(
      (rows || [])
        .map((row) => cleanText(row[key]))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b))
}

async function getJobs() {
  const result = await supabaseAdmin
    .from('send_jobs')
    .select('id, name, title, campaign_type, project_name, batch_name, database_id, created_at')
    .order('created_at', { ascending: false })
    .limit(5000)

  if (result.error) return []

  return result.data || []
}

async function getTemplates() {
  const result = await supabaseAdmin
    .from('send_job_items')
    .select('template_name')
    .not('template_name', 'is', null)
    .limit(50000)

  if (result.error) return []

  return uniqueValues(result.data || [], 'template_name')
}

async function getContacts(phones) {
  const cleanPhones = Array.from(new Set((phones || []).map(cleanPhone).filter(Boolean)))

  if (!cleanPhones.length) return new Map()

  const result = await supabaseAdmin
    .from('contacts')
    .select('id, name, phone')
    .in('phone', cleanPhones)
    .limit(10000)

  if (result.error) return new Map()

  const map = new Map()

  for (const contact of result.data || []) {
    map.set(cleanPhone(contact.phone), contact)
  }

  return map
}

function decorateItem(item, jobMap, contactMap) {
  const job = jobMap.get(item.job_id) || {}
  const phone = cleanPhone(item.phone)
  const contact = contactMap.get(phone) || {}

  return {
    id: item.id,
    job_id: item.job_id || null,
    job_name: job.name || job.title || '',
    phone,
    name: contact.name || item.name || '',

    template_name: item.template_name || '',
    template_language: item.template_language || 'id',
    template_header_type: item.template_header_type || '',

    campaign_type: job.campaign_type || '',
    project_name: job.project_name || '',
    batch_name: job.batch_name || '',

    status: normalizeStatus(item.status),
    raw_status: item.status || '',
    failed_reason: getFailedReason(item),

    message: item.message || '',
    scheduled_at: item.scheduled_at || null,
    processed_at: item.processed_at || null,
    sent_at: item.sent_at || null,
    created_at: item.created_at || null,
    updated_at: item.updated_at || null,
    display_time: getDisplayTime(item),

    attachment_url: item.attachment_url || null,
    attachment_filename: item.attachment_filename || null,
    header_media_id: item.header_media_id || null,
    meta_message_id: item.meta_message_id || item.whatsapp_message_id || null
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

    const page = toPage(req.query.page)
    const limit = toLimit(req.query.limit)
    const offset = (page - 1) * limit

    const q = cleanText(req.query.q)
    const status = cleanText(req.query.status).toLowerCase()
    const template = cleanText(req.query.template)
    const campaignType = cleanText(req.query.campaign_type || req.query.campaignType)
    const projectName = cleanText(req.query.project_name || req.query.projectName)
    const batchName = cleanText(req.query.batch_name || req.query.batchName)

    const jobs = await getJobs()
    const templates = await getTemplates()

    let filteredJobs = jobs

    if (campaignType && campaignType !== 'all') {
      filteredJobs = filteredJobs.filter((job) => cleanText(job.campaign_type) === campaignType)
    }

    if (projectName && projectName !== 'all') {
      filteredJobs = filteredJobs.filter((job) => cleanText(job.project_name || job.name || job.title) === projectName)
    }

    if (batchName && batchName !== 'all') {
      filteredJobs = filteredJobs.filter((job) => cleanText(job.batch_name) === batchName)
    }

    const needJobFilter =
      (campaignType && campaignType !== 'all') ||
      (projectName && projectName !== 'all') ||
      (batchName && batchName !== 'all')

    const filteredJobIds = filteredJobs.map((job) => job.id).filter(Boolean)

    if (needJobFilter && !filteredJobIds.length) {
      return res.status(200).json({
        success: true,
        rows: [],
        page: {
          page,
          limit,
          offset,
          returned: 0,
          total: 0,
          total_pages: 1,
          has_next: false,
          has_prev: false
        },
        options: {
          campaign_types: uniqueValues(jobs, 'campaign_type'),
          project_names: Array.from(
            new Set(
              jobs
                .map((job) => cleanText(job.project_name || job.name || job.title))
                .filter(Boolean)
            )
          ).sort((a, b) => a.localeCompare(b)),
          batch_names: uniqueValues(jobs, 'batch_name'),
          templates
        }
      })
    }

    let query = supabaseAdmin
      .from('send_job_items')
      .select('*', { count: 'exact' })
      .not('template_name', 'is', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (needJobFilter) {
      query = query.in('job_id', filteredJobIds)
    }

    if (template && template !== 'all') {
      query = query.eq('template_name', template)
    }

    if (status && status !== 'all') {
      if (status === 'sent') {
        query = query.in('status', ['sent', 'success', 'delivered', 'read', 'done', 'completed'])
      } else if (status === 'failed') {
        query = query.in('status', ['failed', 'error', 'undelivered', 'rejected', 'cancelled'])
      } else {
        query = query.eq('status', status)
      }
    }

    if (q) {
      const safeQ = q.replace(/[%]/g, '')
      query = query.or(
        `phone.ilike.%${safeQ}%,message.ilike.%${safeQ}%,template_name.ilike.%${safeQ}%,status.ilike.%${safeQ}%`
      )
    }

    const result = await query

    if (result.error) {
      return res.status(500).json({
        success: false,
        message: result.error.message
      })
    }

    const items = result.data || []
    const total = result.count || 0
    const jobIds = Array.from(new Set(items.map((item) => item.job_id).filter(Boolean)))

    const pageJobs = jobs.filter((job) => jobIds.includes(job.id))
    const jobMap = new Map(pageJobs.map((job) => [job.id, job]))

    const contactMap = await getContacts(items.map((item) => item.phone))
    const rows = items.map((item) => decorateItem(item, jobMap, contactMap))

    return res.status(200).json({
      success: true,
      rows,
      page: {
        page,
        limit,
        offset,
        returned: rows.length,
        total,
        total_pages: Math.max(1, Math.ceil(total / limit)),
        has_next: offset + limit < total,
        has_prev: page > 1
      },
      options: {
        campaign_types: uniqueValues(jobs, 'campaign_type'),
        project_names: Array.from(
          new Set(
            jobs
              .map((job) => cleanText(job.project_name || job.name || job.title))
              .filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b)),
        batch_names: uniqueValues(jobs, 'batch_name'),
        templates
      },
      filters: {
        q,
        status,
        template,
        campaign_type: campaignType,
        project_name: projectName,
        batch_name: batchName
      }
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memuat blast history.'
    })
  }
}