import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function cleanText(value) {
  return String(value || '').trim()
}

function toNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function getTime(value) {
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

function getLogMessage(item) {
  return (
    cleanText(item?.message) ||
    cleanText(item?.body) ||
    cleanText(item?.caption) ||
    cleanText(item?.meta_response?.message) ||
    ''
  )
}

function getLogTime(item) {
  return item?.created_at || item?.sent_at || item?.updated_at || new Date().toISOString()
}

function getItemTime(item) {
  return (
    item?.processed_at ||
    item?.sent_at ||
    item?.updated_at ||
    item?.created_at ||
    item?.scheduled_at ||
    ''
  )
}

function normalizeCampaignType(value) {
  const text = cleanText(value)

  if (!text) return ''

  const lower = text.toLowerCase()

  if (lower === 'event') return 'Event'
  if (lower === 'reminder') return 'Reminder'
  if (lower === 'promo') return 'Promo'
  if (lower === 'follow-up' || lower === 'follow up') return 'Follow-up'
  if (lower === 'other') return 'Other'

  return text
}

function getFallbackCampaignType(job) {
  const type = cleanText(job?.type).toLowerCase()
  const name = cleanText(job?.name || job?.title).toLowerCase()

  if (type.includes('reminder') || name.includes('reminder') || name.includes('pengingat')) {
    return 'Reminder'
  }

  if (name.includes('follow')) return 'Follow-up'
  if (name.includes('promo')) return 'Promo'

  return 'Event'
}

function makeCampaignLabel(campaignType, projectName, batchName) {
  const parts = [
    cleanText(campaignType),
    cleanText(projectName),
    cleanText(batchName)
  ].filter(Boolean)

  return parts.join(' - ')
}

async function getOutgoingMessages() {
  try {
    const { data, error } = await supabaseAdmin
      .from('wa_outgoing_messages')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(500)

    if (error) return []

    return data || []
  } catch (error) {
    return []
  }
}

async function getDeliveryLogs() {
  try {
    const { data, error } = await supabaseAdmin
      .from('send_delivery_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000)

    if (error) return []

    return data || []
  } catch (error) {
    return []
  }
}

async function getLatestCampaignByPhone(phones) {
  const safePhones = Array.from(new Set((phones || []).map(cleanText).filter(Boolean)))

  if (!safePhones.length) return new Map()

  try {
    const { data: items, error: itemError } = await supabaseAdmin
      .from('send_job_items')
      .select('id, job_id, phone, template_name, created_at, updated_at, processed_at, sent_at, scheduled_at')
      .in('phone', safePhones)
      .order('created_at', { ascending: false })
      .limit(5000)

    if (itemError) return new Map()

    const latestItemByPhone = new Map()

    for (const item of items || []) {
      const phone = cleanText(item.phone)
      if (!phone) continue

      const current = latestItemByPhone.get(phone)
      const itemTime = getTime(getItemTime(item))
      const currentTime = getTime(getItemTime(current))

      if (!current || itemTime >= currentTime) {
        latestItemByPhone.set(phone, item)
      }
    }

    const jobIds = Array.from(
      new Set(
        Array.from(latestItemByPhone.values())
          .map((item) => item.job_id)
          .filter(Boolean)
      )
    )

    let jobsMap = new Map()

    if (jobIds.length) {
      const { data: jobs, error: jobError } = await supabaseAdmin
        .from('send_jobs')
        .select('id, name, title, type, send_mode, campaign_type, project_name, batch_name, created_at')
        .in('id', jobIds)

      if (!jobError) {
        jobsMap = new Map((jobs || []).map((job) => [job.id, job]))
      }
    }

    const result = new Map()

    for (const [phone, item] of latestItemByPhone.entries()) {
      const job = jobsMap.get(item.job_id) || {}

      const campaignType =
        normalizeCampaignType(job.campaign_type) ||
        getFallbackCampaignType(job)

      const projectName =
        cleanText(job.project_name) ||
        cleanText(job.name) ||
        cleanText(job.title) ||
        cleanText(item.template_name) ||
        ''

      const batchName = cleanText(job.batch_name)

      result.set(phone, {
        campaign_type: campaignType,
        project_name: projectName,
        batch_name: batchName,
        campaign_label: makeCampaignLabel(campaignType, projectName, batchName),
        campaign_job_id: item.job_id || null,
        campaign_template_name: item.template_name || null,
        campaign_last_sent_at: getItemTime(item) || null
      })
    }

    return result
  } catch (error) {
    return new Map()
  }
}

function mergeLastMessage(mergedMap, payload) {
  const phone = cleanText(payload.phone)
  const message = cleanText(payload.message)
  const messageAt = payload.message_at

  if (!phone || !message || !messageAt) return

  const existing = mergedMap.get(phone)
  const messageTime = getTime(messageAt)
  const existingTime = getTime(existing?.last_message_at)

  if (!existing) {
    mergedMap.set(phone, {
      id: phone,
      phone,
      profile_name: phone,
      last_message: message,
      last_message_at: messageAt,
      unread_count: 0,
      status: 'open',
      created_at: messageAt,
      updated_at: messageAt
    })

    return
  }

  if (messageTime >= existingTime) {
    mergedMap.set(phone, {
      ...existing,
      last_message: message,
      last_message_at: messageAt,
      updated_at: messageAt
    })
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    await requireRole(req, res, ['master', 'admin', 'user', 'agent'])

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const { data: conversations, error: convError } = await supabaseAdmin
      .from('wa_conversations')
      .select('*')
      .order('last_message_at', { ascending: false })

    if (convError) {
      return res.status(500).json({
        success: false,
        message: convError.message
      })
    }

    const { data: incomingMessages, error: incomingError } = await supabaseAdmin
      .from('wa_incoming_messages')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(300)

    if (incomingError) {
      return res.status(500).json({
        success: false,
        message: incomingError.message
      })
    }

    const outgoingMessages = await getOutgoingMessages()
    const deliveryLogs = await getDeliveryLogs()

    const mergedMap = new Map()

    for (const conv of conversations || []) {
      if (!conv.phone) continue

      mergedMap.set(conv.phone, {
        id: conv.id || conv.phone,
        phone: conv.phone,
        profile_name: cleanText(conv.profile_name) || conv.phone,
        last_message: conv.last_message || '',
        last_message_at: conv.last_message_at || conv.updated_at || conv.created_at,
        unread_count: Math.max(0, toNumber(conv.unread_count, 0)),
        status: conv.status || 'open',
        created_at: conv.created_at,
        updated_at: conv.updated_at
      })
    }

    for (const msg of incomingMessages || []) {
      if (!msg.phone) continue

      const existing = mergedMap.get(msg.phone)
      const msgTime = getTime(msg.received_at)
      const existingTime = getTime(existing?.last_message_at)

      if (!existing) {
        mergedMap.set(msg.phone, {
          id: msg.phone,
          phone: msg.phone,
          profile_name: cleanText(msg.profile_name) || msg.phone,
          last_message: msg.body || msg.media_caption || '',
          last_message_at: msg.received_at,
          unread_count: 1,
          status: 'open',
          created_at: msg.received_at,
          updated_at: msg.received_at
        })
      } else if (msgTime >= existingTime) {
        mergedMap.set(msg.phone, {
          ...existing,
          profile_name: cleanText(msg.profile_name) || existing.profile_name || msg.phone,
          last_message: msg.body || msg.media_caption || existing.last_message || '',
          last_message_at: msg.received_at || existing.last_message_at
        })
      }
    }

    for (const item of outgoingMessages || []) {
      mergeLastMessage(mergedMap, {
        phone: item.phone,
        message: item.message || item.media_caption || '',
        message_at: item.sent_at || item.created_at
      })
    }

    for (const item of deliveryLogs || []) {
      const mode = cleanText(item.mode).toLowerCase()

      if (mode === 'webhook_status') continue

      mergeLastMessage(mergedMap, {
        phone: item.phone,
        message: getLogMessage(item),
        message_at: getLogTime(item)
      })
    }

    const campaignMap = await getLatestCampaignByPhone(Array.from(mergedMap.keys()))

    const mergedConversations = Array.from(mergedMap.values())
      .map((item) => {
        const campaign = campaignMap.get(item.phone) || {}

        return {
          ...item,
          campaign_type: campaign.campaign_type || 'Organic',
          project_name: campaign.project_name || '',
          batch_name: campaign.batch_name || '',
          campaign_label: campaign.campaign_label || 'Organic / Manual Chat',
          campaign_job_id: campaign.campaign_job_id || null,
          campaign_template_name: campaign.campaign_template_name || null,
          campaign_last_sent_at: campaign.campaign_last_sent_at || null
        }
      })
      .sort((a, b) => {
        return getTime(b.last_message_at) - getTime(a.last_message_at)
      })

    return res.status(200).json({
      success: true,
      conversations: mergedConversations
    })
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Unauthorized'
    })
  }
}