import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

const FREE_TEXT_WINDOW_MS = 24 * 60 * 60 * 1000

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

function getPageNumber(value, fallback) {
  const number = Number(value)

  if (!Number.isFinite(number)) return fallback

  return Math.max(0, Math.floor(number))
}

function getPageLimit(value) {
  const number = Number(value)

  if (!Number.isFinite(number) || number <= 0) return 10000

  return Math.min(20000, Math.max(50, Math.floor(number)))
}

function getPageOffset(value) {
  const number = Number(value)

  if (!Number.isFinite(number) || number < 0) return 0

  return Math.floor(number)
}

function getHoursSince(value) {
  const time = getTime(value)
  if (!time) return null
  return Math.max(0, Math.floor((Date.now() - time) / (60 * 60 * 1000)))
}

function buildWindowInfo(lastIncomingAt) {
  const time = getTime(lastIncomingAt)

  if (!time) {
    return {
      has_customer_inbound: false,
      can_send_free_text: false,
      is_expired_24h: true,
      hours_since_last_incoming: null,
      window_status: 'no_inbound',
      window_note: 'Belum ada pesan masuk dari customer. Gunakan template untuk memulai chat.'
    }
  }

  const expired = Date.now() - time > FREE_TEXT_WINDOW_MS
  const hours = getHoursSince(lastIncomingAt)

  return {
    has_customer_inbound: true,
    can_send_free_text: !expired,
    is_expired_24h: expired,
    hours_since_last_incoming: hours,
    window_status: expired ? 'expired' : 'open',
    window_note: expired
      ? 'Expired >24 jam. Free text berisiko gagal, gunakan template untuk follow-up.'
      : 'Masih dalam window 24 jam. Free text masih bisa digunakan.'
  }
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
  if (lower === 'follow-up' || lower === 'follow up' || lower === 'followup') return 'Follow-up'
  if (lower === 'other') return 'Other'
  if (lower === 'organic') return 'Organic'

  return text
}

function inferProjectFromText(text) {
  const lower = cleanText(text).toLowerCase()

  if (
    lower.includes('suntikan ke-2') ||
    lower.includes('suntikan kedua') ||
    lower.includes('dosis ke-2') ||
    lower.includes('dosis kedua')
  ) return 'Reminder Suntikan ke-2'

  if (
    lower.includes('jadwal vaksin') ||
    lower.includes('vaksinasi') ||
    lower.includes('vaksin')
  ) return 'Reminder Jadwal Vaksin'

  if (
    lower.includes('omni') ||
    lower.includes('vaccinology') ||
    lower.includes('cv2026')
  ) return 'OMNI Vaccinology 2026'

  if (
    lower.includes('seminar') ||
    lower.includes('webinar') ||
    lower.includes('workshop')
  ) return 'Event Seminar / Workshop'

  if (lower.includes('promo')) return 'Promo Campaign'
  if (lower.includes('follow')) return 'Follow-up Campaign'

  return ''
}

function inferCampaignFromText(text) {
  const lower = cleanText(text).toLowerCase()

  if (!lower) {
    return {
      campaign_type: '',
      project_name: '',
      batch_name: ''
    }
  }

  if (
    lower.includes('reminder') ||
    lower.includes('pengingat') ||
    lower.includes('jadwal vaksin') ||
    lower.includes('jadwal anda') ||
    lower.includes('jadwal layanan') ||
    lower.includes('suntikan ke-2') ||
    lower.includes('suntikan kedua') ||
    lower.includes('dosis ke-2') ||
    lower.includes('dosis kedua') ||
    lower.includes('abaikan pesan ini jika') ||
    lower.includes('sudah melakukan vaksinasi') ||
    lower.includes('mau jadwalkan')
  ) {
    return {
      campaign_type: 'Reminder',
      project_name: inferProjectFromText(text) || 'Reminder Jadwal Layanan',
      batch_name: ''
    }
  }

  if (
    lower.includes('follow up') ||
    lower.includes('follow-up') ||
    lower.includes('followup')
  ) {
    return {
      campaign_type: 'Follow-up',
      project_name: inferProjectFromText(text) || 'Follow-up Campaign',
      batch_name: ''
    }
  }

  if (
    lower.includes('promo') ||
    lower.includes('diskon') ||
    lower.includes('special price')
  ) {
    return {
      campaign_type: 'Promo',
      project_name: inferProjectFromText(text) || 'Promo Campaign',
      batch_name: ''
    }
  }

  if (
    lower.includes('event') ||
    lower.includes('seminar') ||
    lower.includes('webinar') ||
    lower.includes('workshop') ||
    lower.includes('omni') ||
    lower.includes('vaccinology') ||
    lower.includes('cv2026')
  ) {
    return {
      campaign_type: 'Event',
      project_name: inferProjectFromText(text) || 'Event Campaign',
      batch_name: ''
    }
  }

  return {
    campaign_type: '',
    project_name: '',
    batch_name: ''
  }
}

function inferCampaignType({ job, template, item }) {
  const jobCampaign = normalizeCampaignType(job?.campaign_type)
  if (jobCampaign) return jobCampaign

  const templateCampaign = normalizeCampaignType(template?.campaign_type)
  if (templateCampaign) return templateCampaign

  const jobCategory = cleanText(job?.category).toLowerCase()
  const templateCategory = cleanText(template?.category).toLowerCase()
  const jobType = cleanText(job?.type).toLowerCase()
  const jobMode = cleanText(job?.send_mode || job?.mode).toLowerCase()
  const jobName = cleanText(job?.name || job?.title).toLowerCase()
  const templateName = cleanText(item?.template_name || template?.name).toLowerCase()

  if (
    jobCategory === 'utility' ||
    templateCategory === 'utility' ||
    jobType.includes('reminder') ||
    jobName.includes('reminder') ||
    jobName.includes('pengingat') ||
    templateName.includes('reminder') ||
    templateName.includes('pengingat')
  ) return 'Reminder'

  if (jobName.includes('follow') || templateName.includes('follow')) return 'Follow-up'
  if (jobName.includes('promo') || templateName.includes('promo')) return 'Promo'

  if (jobMode === 'template' || cleanText(item?.template_name)) return 'Event'

  return ''
}

function makeCampaignLabel(campaignType, projectName, batchName) {
  return [campaignType, projectName, batchName].map(cleanText).filter(Boolean).join(' - ')
}

function getProjectName({ job, template, item }) {
  return (
    cleanText(job?.project_name) ||
    cleanText(template?.project_name) ||
    cleanText(job?.name) ||
    cleanText(job?.title) ||
    cleanText(item?.template_name) ||
    cleanText(template?.name) ||
    ''
  )
}

function getBatchName({ job, template }) {
  return cleanText(job?.batch_name) || cleanText(template?.batch_name) || ''
}

async function safeQuery(callback, fallback) {
  try {
    const result = await callback()
    if (result.error) return fallback
    return result.data || fallback
  } catch (error) {
    return fallback
  }
}

async function getOutgoingMessages() {
  return safeQuery(
    () =>
      supabaseAdmin
        .from('wa_outgoing_messages')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(3000),
    []
  )
}

async function getDeliveryLogs() {
  return safeQuery(
    () =>
      supabaseAdmin
        .from('send_delivery_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5000),
    []
  )
}


async function getTemplateBlastItemsPaged() {
  const all = []
  const pageSize = 1000

  for (let from = 0; from < 100000; from += pageSize) {
    const to = from + pageSize - 1

    const result = await supabaseAdmin
      .from('send_job_items')
      .select('id, job_id, phone, message, status, template_name, template_language, template_header_type, created_at, updated_at, processed_at, sent_at, scheduled_at, error_message')
      .not('template_name', 'is', null)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (result.error) break

    const rows = result.data || []
    all.push(...rows)

    if (rows.length < pageSize) break
  }

  return all
}

async function getTemplateBlastItemsOld() {
  return safeQuery(
    () =>
      supabaseAdmin
        .from('send_job_items')
        .select('id, job_id, phone, message, status, template_name, template_language, template_header_type, created_at, updated_at, processed_at, sent_at, scheduled_at, error_message')
        .not('template_name', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50000),
    []
  )
}

async function getTemplateMap() {
  const data = await safeQuery(
    () => supabaseAdmin.from('wa_templates').select('*').limit(1000),
    []
  )

  const map = new Map()

  for (const template of data || []) {
    const name = cleanText(template.name)
    const language = cleanText(template.language) || 'id'

    if (name) {
      map.set(name, template)
      map.set(`${name}::${language}`, template)
    }
  }

  return map
}

async function getJobsMap(jobIds) {
  const ids = Array.from(new Set((jobIds || []).map(cleanText).filter(Boolean)))
  if (!ids.length) return new Map()

  const data = await safeQuery(
    () => supabaseAdmin.from('send_jobs').select('*').in('id', ids),
    []
  )

  return new Map((data || []).map((job) => [job.id, job]))
}

async function getLatestCampaignByPhone(phones) {
  const targetPhones = new Set((phones || []).map(cleanPhone).filter(Boolean))
  if (!targetPhones.size) return new Map()

  const items = await safeQuery(
    () =>
      supabaseAdmin
        .from('send_job_items')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30000),
    []
  )

  const latestItemByPhone = new Map()

  for (const item of items || []) {
    const phone = cleanPhone(item.phone)
    if (!phone || !targetPhones.has(phone)) continue

    const current = latestItemByPhone.get(phone)
    const itemTime = getTime(getItemTime(item))
    const currentTime = getTime(getItemTime(current))

    if (!current || itemTime >= currentTime) latestItemByPhone.set(phone, item)
  }

  const jobIds = Array.from(
    new Set(
      Array.from(latestItemByPhone.values())
        .map((item) => item.job_id)
        .filter(Boolean)
    )
  )

  const jobsMap = await getJobsMap(jobIds)
  const templateMap = await getTemplateMap()
  const result = new Map()

  for (const [phone, item] of latestItemByPhone.entries()) {
    const job = jobsMap.get(item.job_id) || {}
    const templateName = cleanText(item.template_name)
    const templateLanguage = cleanText(item.template_language) || 'id'

    const template =
      templateMap.get(`${templateName}::${templateLanguage}`) ||
      templateMap.get(templateName) ||
      {}

    const campaignType = inferCampaignType({ job, template, item })
    const projectName = getProjectName({ job, template, item })
    const batchName = getBatchName({ job, template })

    result.set(phone, {
      campaign_type: campaignType || 'Event',
      project_name: projectName,
      batch_name: batchName,
      campaign_label: makeCampaignLabel(campaignType || 'Event', projectName, batchName),
      campaign_job_id: item.job_id || null,
      campaign_template_name: item.template_name || null,
      campaign_last_sent_at: getItemTime(item) || null
    })
  }

  return result
}

function mergeLastMessage(mergedMap, payload) {
  const phone = cleanPhone(payload.phone)
  const message = cleanText(payload.message)
  const messageAt = payload.message_at
  const direction = cleanText(payload.direction).toLowerCase()

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
      updated_at: messageAt,
      last_incoming_at: direction === 'incoming' ? messageAt : null,
      last_outgoing_message: direction === 'outgoing' ? message : '',
      last_outgoing_at: direction === 'outgoing' ? messageAt : null
    })
    return
  }

  const next = { ...existing }

  if (messageTime >= existingTime) {
    next.last_message = message
    next.last_message_at = messageAt
    next.updated_at = messageAt
  }

  if (direction === 'incoming') {
    const currentIncomingTime = getTime(existing.last_incoming_at)
    if (!existing.last_incoming_at || messageTime >= currentIncomingTime) {
      next.last_incoming_at = messageAt
    }
  }

  if (direction === 'outgoing') {
    const currentOutgoingTime = getTime(existing.last_outgoing_at)
    if (!existing.last_outgoing_at || messageTime >= currentOutgoingTime) {
      next.last_outgoing_message = message
      next.last_outgoing_at = messageAt
    }
  }

  mergedMap.set(phone, next)
}

function applyCampaignFallback(item, campaign) {
  const outgoingText = cleanText(item.last_outgoing_message)
  const lastText = cleanText(item.last_message)
  const inferred = inferCampaignFromText(`${outgoingText}\n${lastText}`)

  let campaignType = cleanText(campaign.campaign_type)
  let projectName = cleanText(campaign.project_name)
  let batchName = cleanText(campaign.batch_name)

  if (
    inferred.campaign_type &&
    (!campaignType ||
      campaignType === 'Organic' ||
      (campaignType === 'Event' && inferred.campaign_type === 'Reminder'))
  ) campaignType = inferred.campaign_type

  if (!projectName && inferred.project_name) projectName = inferred.project_name
  if (!batchName && inferred.batch_name) batchName = inferred.batch_name
  if (!campaignType) campaignType = 'Organic'

  return {
    campaign_type: campaignType,
    project_name: projectName,
    batch_name: batchName,
    campaign_label:
      campaignType === 'Organic'
        ? 'Organic / Manual Chat'
        : makeCampaignLabel(campaignType, projectName, batchName),
    campaign_job_id: campaign.campaign_job_id || null,
    campaign_template_name: campaign.campaign_template_name || null,
    campaign_last_sent_at: campaign.campaign_last_sent_at || null
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
      .limit(3000)

    if (incomingError) {
      return res.status(500).json({
        success: false,
        message: incomingError.message
      })
    }

    const outgoingMessages = await getOutgoingMessages()
    const deliveryLogs = await getDeliveryLogs()
    const blastHistoryItems = await getTemplateBlastItemsPaged()
    const mergedMap = new Map()

    for (const conv of conversations || []) {
      const phone = cleanPhone(conv.phone)
      if (!phone) continue

      mergedMap.set(phone, {
        id: conv.id || phone,
        phone,
        profile_name: cleanText(conv.profile_name) || phone,
        last_message: conv.last_message || '',
        last_message_at: conv.last_message_at || conv.updated_at || conv.created_at,
        unread_count: Math.max(0, toNumber(conv.unread_count, 0)),
        status: conv.status || 'open',
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        last_incoming_at: conv.last_incoming_at || null,
        last_outgoing_message: '',
        last_outgoing_at: null
      })
    }

    for (const msg of incomingMessages || []) {
      mergeLastMessage(mergedMap, {
        phone: msg.phone,
        message: msg.body || msg.media_caption || '',
        message_at: msg.received_at,
        direction: 'incoming'
      })

      const phone = cleanPhone(msg.phone)
      const existing = mergedMap.get(phone)

      if (existing) {
        existing.profile_name = cleanText(msg.profile_name) || existing.profile_name || phone
        mergedMap.set(phone, existing)
      }
    }

    for (const item of outgoingMessages || []) {
      mergeLastMessage(mergedMap, {
        phone: item.phone,
        message: item.message || item.media_caption || '',
        message_at: item.sent_at || item.created_at,
        direction: 'outgoing'
      })
    }

    for (const item of deliveryLogs || []) {
      const mode = cleanText(item.mode).toLowerCase()
      if (mode === 'webhook_status') continue

      mergeLastMessage(mergedMap, {
        phone: item.phone,
        message: getLogMessage(item),
        message_at: getLogTime(item),
        direction: 'outgoing'
      })
    }

    for (const item of blastHistoryItems || []) {
      const displayMessage =
        cleanText(item.message) ||
        (cleanText(item.template_name) ? 'Template Blast: ' + cleanText(item.template_name) : '[Template Blast]')

      const displayTime =
        getItemTime(item) ||
        item.created_at ||
        item.updated_at ||
        new Date().toISOString()

      mergeLastMessage(mergedMap, {
        phone: item.phone,
        message: displayMessage,
        message_at: displayTime,
        direction: 'outgoing'
      })
    }

    const campaignMap = await getLatestCampaignByPhone(Array.from(mergedMap.keys()))

    const mergedConversations = Array.from(mergedMap.values())
      .map((item) => {
        const rawCampaign = campaignMap.get(cleanPhone(item.phone)) || {}
        const campaign = applyCampaignFallback(item, rawCampaign)
        const windowInfo = buildWindowInfo(item.last_incoming_at)

        return {
          ...item,
          ...windowInfo,
          campaign_type: campaign.campaign_type || 'Organic',
          project_name: campaign.project_name || '',
          batch_name: campaign.batch_name || '',
          campaign_label: campaign.campaign_label || 'Organic / Manual Chat',
          campaign_job_id: campaign.campaign_job_id || null,
          campaign_template_name: campaign.campaign_template_name || null,
          campaign_last_sent_at: campaign.campaign_last_sent_at || null
        }
      })
      .sort((a, b) => getTime(b.last_message_at) - getTime(a.last_message_at))

    const pageLimit = getPageLimit(req.query.limit)
    const pageOffset = getPageOffset(req.query.offset)
    const totalConversations = mergedConversations.length
    const pagedConversations = mergedConversations.slice(pageOffset, pageOffset + pageLimit)

    return res.status(200).json({
      success: true,
      conversations: pagedConversations,
      page: {
        limit: pageLimit,
        offset: pageOffset,
        returned: pagedConversations.length,
        total: totalConversations,
        has_more: pageOffset + pageLimit < totalConversations,
        next_offset: pageOffset + pageLimit < totalConversations ? pageOffset + pageLimit : null
      },
      debug: {
        conversations: mergedConversations.length,
        total_all: totalConversations,
        returned_page: pagedConversations.length,
        campaign_matched: mergedConversations.filter((item) => item.campaign_type !== 'Organic').length,
        campaign_unmatched: mergedConversations.filter((item) => item.campaign_type === 'Organic').length,
        expired_24h: mergedConversations.filter((item) => item.is_expired_24h).length,
        blast_history_items: blastHistoryItems.length
      }
    })
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Unauthorized'
    })
  }
}
