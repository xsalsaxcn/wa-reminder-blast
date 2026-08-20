// NOTIVA_PATCH_01_SAFE_NOTIFICATION_QUERY_V1
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

function toNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function getTime(value) {
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

async function fetchUnreadConversations() {
  const pageSize = 1000
  const rows = []

  for (let from = 0; from < 100000; from += pageSize) {
    const to = from + pageSize - 1

    const result = await supabaseAdmin
      .from('wa_conversations')
      .select('id, phone, profile_name, last_message, last_message_at, unread_count, status, created_at, updated_at')
      .gt('unread_count', 0)
      .order('last_message_at', { ascending: false })
      .range(from, to)

    if (result.error) throw result.error

    const pageRows = Array.isArray(result.data) ? result.data : []
    rows.push(...pageRows)

    if (pageRows.length < pageSize) break
  }

  return rows
}

// NOTIVA_PATCH_03_SAFE_NOTIFICATION_CAMPAIGN_CONTEXT_V1
function getCampaignItemTime(item) {
  return (
    item?.processed_at ||
    item?.created_at ||
    item?.scheduled_at ||
    item?.updated_at ||
    null
  )
}

function isUsableCampaignItem(item) {
  const status = cleanText(item?.status).toLowerCase()

  if (!status) return true

  return ![
    'pending',
    'queued',
    'queue',
    'processing',
    'scheduled',
    'failed',
    'error',
    'cancelled',
    'canceled'
  ].includes(status)
}

function buildPhoneVariants(phone) {
  const clean = cleanPhone(phone)
  if (!clean) return []

  const values = new Set([clean, '+' + clean])

  if (clean.startsWith('62') && clean.length > 2) {
    values.add('0' + clean.slice(2))
  }

  return Array.from(values)
}

function inferNotificationType(item, job) {
  const jobType = cleanText(job?.type).toLowerCase()
  const campaignType = cleanText(job?.campaign_type).toLowerCase()
  const sendMode = cleanText(job?.send_mode || job?.mode).toLowerCase()
  const text = [
    job?.name,
    job?.title,
    item?.template_name
  ].map(cleanText).join(' ').toLowerCase()

  if (
    jobType === 'reminder' ||
    campaignType === 'reminder' ||
    text.includes('reminder') ||
    text.includes('pengingat')
  ) return 'Reminder'

  if (
    jobType === 'blast' ||
    sendMode === 'template' ||
    cleanText(item?.template_name)
  ) return 'Blast'

  if (campaignType) {
    return campaignType.charAt(0).toUpperCase() + campaignType.slice(1)
  }

  return item ? 'Campaign' : 'Organic'
}

function getNotificationCampaignTitle(item, job) {
  return (
    cleanText(item?.template_name) ||
    cleanText(job?.project_name) ||
    cleanText(job?.title) ||
    cleanText(job?.name) ||
    ''
  )
}

async function getNotificationCampaignContext(conversations) {
  const context = new Map()
  const conversationByPhone = new Map()

  for (const conversation of conversations || []) {
    const phone = cleanPhone(conversation?.phone)
    if (!phone) continue

    conversationByPhone.set(phone, conversation)
    context.set(phone, {
      notification_type: 'Organic',
      notification_campaign_title: '',
      notification_template_name: '',
      notification_job_id: null
    })
  }

  if (!conversationByPhone.size) return context

  try {
    const queryPhones = Array.from(
      new Set(
        Array.from(conversationByPhone.keys()).flatMap(buildPhoneVariants)
      )
    )

    const items = []
    const queryChunkSize = 100

    for (let index = 0; index < queryPhones.length; index += queryChunkSize) {
      const chunk = queryPhones.slice(index, index + queryChunkSize)
      if (!chunk.length) continue

      const result = await supabaseAdmin
        .from('send_job_items')
        .select('id, job_id, phone, template_name, status, processed_at, updated_at, created_at, scheduled_at')
        .in('phone', chunk)
        .order('created_at', { ascending: false })
        .limit(500)

      if (result.error) continue
      items.push(...(result.data || []))
    }

    const latestItemByPhone = new Map()

    for (const item of items) {
      if (!isUsableCampaignItem(item)) continue

      const phone = cleanPhone(item?.phone)
      const conversation = conversationByPhone.get(phone)
      if (!phone || !conversation) continue

      const itemTime = getTime(getCampaignItemTime(item))
      const conversationTime = getTime(conversation.last_message_at)

      // Associate the unread reply with the most recent campaign/template that
      // was already sent before the latest conversation activity.
      if (conversationTime && itemTime && itemTime > conversationTime + 5 * 60 * 1000) continue

      const current = latestItemByPhone.get(phone)
      const currentTime = getTime(getCampaignItemTime(current))

      if (!current || itemTime >= currentTime) {
        latestItemByPhone.set(phone, item)
      }
    }

    const jobIds = Array.from(
      new Set(
        Array.from(latestItemByPhone.values())
          .map((item) => cleanText(item?.job_id))
          .filter(Boolean)
      )
    )

    const jobs = new Map()

    for (let index = 0; index < jobIds.length; index += 100) {
      const chunk = jobIds.slice(index, index + 100)
      if (!chunk.length) continue

      const result = await supabaseAdmin
        .from('send_jobs')
        .select('*')
        .in('id', chunk)

      if (result.error) continue

      for (const job of result.data || []) {
        jobs.set(job.id, job)
      }
    }

    for (const [phone, item] of latestItemByPhone.entries()) {
      const job = jobs.get(item?.job_id) || {}
      const templateName = cleanText(item?.template_name)

      context.set(phone, {
        notification_type: inferNotificationType(item, job),
        notification_campaign_title: getNotificationCampaignTitle(item, job),
        notification_template_name: templateName,
        notification_job_id: item?.job_id || null
      })
    }
  } catch (error) {
    // Campaign enrichment is deliberately non-blocking. If metadata lookup fails,
    // existing unread notification behavior must continue to work.
    console.error('Failed to enrich inbox notification campaign context:', error)
  }

  return context
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  res.setHeader('X-Notiva-Optimization', 'safe-notification-query-v1')

  try {
    const authUser = await requireRole(req, res, ['master', 'admin', 'user', 'agent'])
    if (!authUser) return

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const rows = await fetchUnreadConversations()
    const merged = new Map()

    for (const row of rows) {
      const phone = cleanPhone(row.phone)
      if (!phone) continue

      const next = {
        id: row.id || phone,
        phone,
        profile_name: cleanText(row.profile_name) || phone,
        last_message: row.last_message || '',
        last_message_at: row.last_message_at || row.updated_at || row.created_at || null,
        unread_count: Math.max(0, toNumber(row.unread_count, 0)),
        status: row.status || 'open',
        created_at: row.created_at || null,
        updated_at: row.updated_at || null
      }

      const existing = merged.get(phone)
      if (!existing || getTime(next.last_message_at) >= getTime(existing.last_message_at)) {
        merged.set(phone, next)
      }
    }

    const conversations = Array.from(merged.values())
      .filter((item) => item.unread_count > 0)
      .sort((a, b) => getTime(b.last_message_at) - getTime(a.last_message_at))

    const campaignContext = await getNotificationCampaignContext(conversations.slice(0, 30))
    const enrichedConversations = conversations.map((item) => ({
      ...item,
      ...(campaignContext.get(cleanPhone(item.phone)) || {
        notification_type: 'Organic',
        notification_campaign_title: '',
        notification_template_name: '',
        notification_job_id: null
      })
    }))

    return res.status(200).json({
      success: true,
      conversations: enrichedConversations,
      unread_total: enrichedConversations.reduce((sum, item) => sum + item.unread_count, 0)
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memuat inbox notification'
    })
  }
}
