import { supabaseAdmin } from './supabaseAdmin'

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_MARKETING_TEMPLATE_COST_IDR = 45
const DEFAULT_UTILITY_TEMPLATE_COST_IDR = 45

function toLocalStartIso(dateText) {
  if (!dateText) return null
  return new Date(`${dateText}T00:00:00+07:00`).toISOString()
}

function toLocalEndIso(dateText) {
  if (!dateText) return null
  return new Date(`${dateText}T23:59:59+07:00`).toISOString()
}

function normalizePhone(phone) {
  let value = String(phone || '').replace(/\D/g, '')

  if (value.startsWith('0')) {
    value = '62' + value.slice(1)
  }

  return value
}

function safeMessage(text) {
  return String(text || '').trim()
}

function safeText(value) {
  return String(value || '').trim()
}

function toNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeStatus(status) {
  const text = safeText(status).toLowerCase()

  if (text === 'success') return 'sent'
  if (text === 'done') return 'sent'
  if (text === 'completed') return 'sent'
  if (text === 'error') return 'failed'

  return text || 'pending'
}

function isBillableSuccessStatus(status) {
  const text = normalizeStatus(status)

  return ['sent', 'delivered', 'read'].includes(text)
}

function isFailedStatus(status) {
  const text = normalizeStatus(status)

  return ['failed', 'cancelled', 'canceled'].includes(text)
}

function getMarketingRate() {
  return toNumber(
    process.env.WA_ESTIMATED_MARKETING_TEMPLATE_COST_IDR ||
      process.env.WA_ESTIMATED_PAID_MESSAGE_COST_IDR,
    DEFAULT_MARKETING_TEMPLATE_COST_IDR
  )
}

function getUtilityRate() {
  return toNumber(
    process.env.WA_ESTIMATED_UTILITY_TEMPLATE_COST_IDR ||
      process.env.WA_ESTIMATED_PAID_MESSAGE_COST_IDR,
    DEFAULT_UTILITY_TEMPLATE_COST_IDR
  )
}

function getTemplateCategory({ item, job }) {
  const itemCategory = safeText(
    item?.template_category ||
      item?.templateCategory ||
      item?.category
  ).toLowerCase()

  if (itemCategory.includes('utility')) return 'utility'
  if (itemCategory.includes('marketing')) return 'marketing'
  if (itemCategory.includes('auth')) return 'authentication'

  const jobType = safeText(job?.type || job?.send_mode || job?.job_type).toLowerCase()

  if (jobType.includes('reminder')) return 'utility'

  return 'marketing'
}

function getTemplateRate({ item, job }) {
  const category = getTemplateCategory({ item, job })

  if (category === 'utility') return getUtilityRate()

  return getMarketingRate()
}

function isTemplateJobItem(item) {
  return Boolean(
    safeText(item?.template_name) ||
      safeText(item?.template_language) ||
      safeText(item?.template_header_type)
  )
}

function isTemplateSource({ source, item, job }) {
  const sourceText = safeText(source).toLowerCase()
  const jobType = safeText(job?.type || job?.send_mode || job?.job_type).toLowerCase()

  if (isTemplateJobItem(item)) return true
  if (sourceText.includes('template')) return true
  if (jobType.includes('template')) return true

  return false
}

function findLastIncoming(phone, sentAt, incomingByPhone) {
  const list = incomingByPhone.get(phone) || []
  const sentTime = new Date(sentAt).getTime()

  if (!Number.isFinite(sentTime)) return null

  let latest = null

  for (const item of list) {
    const receivedTime = new Date(item.received_at).getTime()

    if (!Number.isFinite(receivedTime)) continue

    if (receivedTime <= sentTime) {
      if (!latest || receivedTime > new Date(latest.received_at).getTime()) {
        latest = item
      }
    }
  }

  return latest
}

function buildBillingInfo({
  status,
  sentAt,
  phone,
  incomingByPhone,
  source,
  item = null,
  job = null
}) {
  const normalizedStatus = normalizeStatus(status)

  if (isFailedStatus(normalizedStatus)) {
    return {
      last_incoming_at: null,
      is_24h_window: false,
      billing_type: 'Failed / no charge',
      estimated_cost_idr: 0,
      billing_rate_idr: 0,
      billing_category: 'not_counted'
    }
  }

  if (!isBillableSuccessStatus(normalizedStatus)) {
    return {
      last_incoming_at: null,
      is_24h_window: false,
      billing_type: 'Pending / belum final',
      estimated_cost_idr: 0,
      billing_rate_idr: 0,
      billing_category: 'pending'
    }
  }

  const templateMessage = isTemplateSource({
    source,
    item,
    job
  })

  if (templateMessage) {
    const rate = getTemplateRate({ item, job })
    const category = getTemplateCategory({ item, job })

    return {
      last_incoming_at: null,
      is_24h_window: false,
      billing_type:
        category === 'utility'
          ? 'Paid estimate / Utility Template'
          : 'Paid estimate / Marketing Template',
      estimated_cost_idr: rate,
      billing_rate_idr: rate,
      billing_category: category
    }
  }

  const lastIncoming = findLastIncoming(phone, sentAt, incomingByPhone)

  if (!lastIncoming) {
    return {
      last_incoming_at: null,
      is_24h_window: false,
      billing_type: 'Outside 24h / not template',
      estimated_cost_idr: 0,
      billing_rate_idr: 0,
      billing_category: 'not_counted'
    }
  }

  const sentTime = new Date(sentAt).getTime()
  const incomingTime = new Date(lastIncoming.received_at).getTime()
  const within24h = Number.isFinite(sentTime) &&
    Number.isFinite(incomingTime) &&
    sentTime - incomingTime <= DAY_MS

  if (within24h) {
    return {
      last_incoming_at: lastIncoming.received_at,
      is_24h_window: true,
      billing_type: 'Free 24h / service reply',
      estimated_cost_idr: 0,
      billing_rate_idr: 0,
      billing_category: 'free_24h'
    }
  }

  return {
    last_incoming_at: lastIncoming.received_at,
    is_24h_window: false,
    billing_type: 'Outside 24h / not counted',
    estimated_cost_idr: 0,
    billing_rate_idr: 0,
    billing_category: 'not_counted'
  }
}

function getJobSourceLabel(jobType, item) {
  const safeJobType = safeText(jobType).toLowerCase()

  if (isTemplateJobItem(item)) {
    if (safeJobType === 'reminder') return 'Template Reminder'
    return 'Template Blast'
  }

  if (safeJobType === 'blast') return 'WhatsApp Blast'
  if (safeJobType === 'reminder') return 'Reminder'

  return 'Job Queue'
}

function sourceMatchesFilter(row, source) {
  if (!source || source === 'all') return true

  if (source === 'job') return row.source !== 'inbox_reply'

  if (source === 'blast') {
    return row.source === 'blast' || row.source === 'template_blast'
  }

  if (source === 'reminder') {
    return row.source === 'reminder' || row.source === 'template_reminder'
  }

  return row.source === source
}

function statusMatchesFilter(row, status) {
  if (!status || status === 'all') return true

  const rowStatus = normalizeStatus(row.status)
  const selected = normalizeStatus(status)

  if (selected === 'sent') {
    return ['sent', 'delivered', 'read'].includes(rowStatus)
  }

  return rowStatus === selected
}

export async function buildUsageRows(filters = {}) {
  const {
    start,
    end,
    source = 'all',
    status = 'all',
    job_id = '',
    limit = 5000
  } = filters

  const safeLimit = Math.min(Math.max(Number(limit) || 5000, 1), 10000)
  const startIso = toLocalStartIso(start)
  const endIso = toLocalEndIso(end)

  const incomingStartIso = startIso
    ? new Date(new Date(startIso).getTime() - DAY_MS).toISOString()
    : null

  let outgoingQuery = supabaseAdmin
    .from('wa_outgoing_messages')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(safeLimit)

  if (startIso) outgoingQuery = outgoingQuery.gte('sent_at', startIso)
  if (endIso) outgoingQuery = outgoingQuery.lte('sent_at', endIso)

  const { data: outgoingMessages, error: outgoingError } = await outgoingQuery

  if (outgoingError) {
    throw new Error(outgoingError.message)
  }

  let jobItemQuery = supabaseAdmin
    .from('send_job_items')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(safeLimit)

  if (startIso) jobItemQuery = jobItemQuery.gte('created_at', startIso)
  if (endIso) jobItemQuery = jobItemQuery.lte('created_at', endIso)

  if (job_id && job_id !== 'all') {
    jobItemQuery = jobItemQuery.eq('job_id', job_id)
  }

  const { data: jobItems, error: jobItemError } = await jobItemQuery

  if (jobItemError) {
    throw new Error(jobItemError.message)
 