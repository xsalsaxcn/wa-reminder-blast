import { requireRole } from '../../../lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

function cleanPhone(phone) {
  let value = String(phone || '').replace(/\D/g, '')
  if (value.startsWith('0')) value = '62' + value.slice(1)
  return value
}

function phoneVariants(phone) {
  const clean = cleanPhone(phone)
  const variants = [clean]

  if (clean.startsWith('62')) variants.push('0' + clean.slice(2))
  if (clean) variants.push('+' + clean)

  return Array.from(new Set(variants.filter(Boolean)))
}

function cleanText(value) {
  return String(value || '').trim()
}

function toLimit(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(10, Math.floor(number)))
}

function getTime(value) {
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

function normalizeOutgoingStatus(item) {
  const status = cleanText(item?.status).toLowerCase()

  if (status === 'read') return 'read'
  if (status === 'delivered') return 'delivered'
  if (status === 'failed') return 'failed'
  if (status === 'error') return 'failed'
  if (status === 'sent') return 'sent'
  if (status === 'success') return 'sent'
  if (status === 'processing') return 'processing'
  if (status === 'pending') return 'pending'

  if (item?.error_message) return 'failed'
  if (item?.meta_message_id) return 'sent'

  return status || 'sent'
}

function getLogMetaMessageId(item) {
  return (
    cleanText(item?.meta_message_id) ||
    cleanText(item?.meta_response?.meta_message_id) ||
    cleanText(item?.meta_response?.messages?.[0]?.id) ||
    cleanText(item?.response?.messages?.[0]?.id)
  )
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

function getLogCreatedAt(item) {
  return item?.created_at || item?.sent_at || item?.updated_at || new Date().toISOString()
}

function getMediaUrl(item) {
  return (
    cleanText(item?.attachment_url) ||
    cleanText(item?.media_url) ||
    cleanText(item?.image_url) ||
    cleanText(item?.file_url) ||
    cleanText(item?.document_url) ||
    ''
  )
}

function getMediaType(item) {
  const directType = cleanText(item?.message_type || item?.attachment_type || item?.media_type).toLowerCase()
  const mime = cleanText(item?.media_mime_type || item?.mime_type || item?.attachment_mime_type).toLowerCase()
  const url = getMediaUrl(item).toLowerCase()

  if (directType) return directType
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (url.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/)) return 'image'
  if (url.match(/\.(mp4|mov|webm)(\?|$)/)) return 'video'
  if (url) return 'document'

  return 'text'
}

function getMediaMime(item) {
  return (
    cleanText(item?.media_mime_type) ||
    cleanText(item?.mime_type) ||
    cleanText(item?.attachment_mime_type) ||
    null
  )
}

function getMediaFilename(item) {
  return (
    cleanText(item?.media_filename) ||
    cleanText(item?.attachment_filename) ||
    cleanText(item?.file_name) ||
    cleanText(item?.filename) ||
    null
  )
}

async function markConversationRead(phone) {
  try {
    await supabaseAdmin
      .from('wa_conversations')
      .update({
        unread_count: 0,
        updated_at: new Date().toISOString()
      })
      .eq('phone', phone)
  } catch (error) {
    // Jangan gagalkan load messages hanya karena mark read gagal.
  }
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

async function getDeliveryLogs(phone) {
  return safeQuery(
    () =>
      supabaseAdmin
        .from('send_delivery_logs')
        .select('*')
        .in('phone', phoneVariants(phone))
        .order('created_at', { ascending: true })
        .limit(3000),
    []
  )
}

async function getJobItems(phone) {
  return safeQuery(
    () =>
      supabaseAdmin
        .from('send_job_items')
        .select('*')
        .in('phone', phoneVariants(phone))
        .order('created_at', { ascending: true })
        .limit(3000),
    []
  )
}

async function getLatestStatusesByMetaId(metaIds) {
  const ids = Array.from(new Set((metaIds || []).map(cleanText).filter(Boolean)))
  if (!ids.length) return new Map()

  const data = await safeQuery(
    () =>
      supabaseAdmin
        .from('send_delivery_logs')
        .select('*')
        .in('meta_message_id', ids)
        .order('created_at', { ascending: true })
        .limit(5000),
    []
  )

  const map = new Map()

  for (const item of data || []) {
    const metaId = getLogMetaMessageId(item)
    if (!metaId) continue

    map.set(metaId, {
      status: normalizeOutgoingStatus(item),
      created_at: getLogCreatedAt(item),
      error_message: item.error_message || item.error || null
    })
  }

  return map
}

function normalizeMessage(row) {
  return {
    ...row,
    created_at: row.created_at || new Date().toISOString(),
    sort_time: getTime(row.created_at)
  }
}

function dedupeMessages(rows) {
  const map = new Map()

  for (const row of rows || []) {
    const metaKey = cleanText(row.meta_message_id)
    const key = metaKey
      ? `meta:${metaKey}`
      : `${row.direction}:${row.created_at}:${cleanText(row.message).slice(0, 80)}:${row.media_id || row.media_url || ''}`

    const current = map.get(key)

    if (!current) {
      map.set(key, row)
      continue
    }

    map.set(key, {
      ...current,
      ...row,
      message: row.message || current.message,
      media_id: row.media_id || current.media_id,
      media_url: row.media_url || current.media_url,
      media_mime_type: row.media_mime_type || current.media_mime_type,
      media_filename: row.media_filename || current.media_filename,
      error_message: row.error_message || current.error_message,
      status: row.status || current.status
    })
  }

  return Array.from(map.values())
}

function getAttachmentCaption(item) {
  return (
    cleanText(item?.media_caption) ||
    cleanText(item?.attachment_caption) ||
    cleanText(item?.caption) ||
    ''
  )
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

    const phone = cleanPhone(req.query.phone)
    const limit = toLimit(req.query.limit)
    const before = cleanText(req.query.before)
    const focusItemId = cleanText(req.query.job_item_id || req.query.item_id)
    const beforeTime = before ? getTime(before) : 0

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone is required'
      })
    }

    await markConversationRead(phone)

    const variants = phoneVariants(phone)

    const incoming = await safeQuery(
      () =>
        supabaseAdmin
          .from('wa_incoming_messages')
          .select('*')
          .in('phone', variants)
          .order('received_at', { ascending: true })
          .limit(3000),
      []
    )

    const outgoing = await safeQuery(
      () =>
        supabaseAdmin
          .from('wa_outgoing_messages')
          .select('*')
          .in('phone', variants)
          .order('sent_at', { ascending: true })
          .limit(3000),
      []
    )

    const deliveryLogs = await getDeliveryLogs(phone)
    let jobItems = await getJobItems(phone)

    if (focusItemId && !jobItems.some((item) => cleanText(item.id) === focusItemId)) {
      const focusItemResult = await supabaseAdmin
        .from('send_job_items')
        .select('*')
        .eq('id', focusItemId)
        .single()

      if (!focusItemResult.error && focusItemResult.data) {
        jobItems = [...jobItems, focusItemResult.data]
      }
    }

    const outgoingMetaIds = new Set(
      (outgoing || [])
        .map((item) => cleanText(item.meta_message_id))
        .filter(Boolean)
    )

    const deliveryMetaIds = deliveryLogs
      .map(getLogMetaMessageId)
      .filter(Boolean)

    const jobMetaIds = jobItems
      .map((item) => cleanText(item.meta_message_id || item.whatsapp_message_id))
      .filter(Boolean)

    const allMetaIds = [
      ...(outgoing || []).map((item) => cleanText(item.meta_message_id)).filter(Boolean),
      ...deliveryMetaIds,
      ...jobMetaIds
    ]

    const latestStatusMap = await getLatestStatusesByMetaId(allMetaIds)

    const incomingMessages = (incoming || []).map((item) =>
      normalizeMessage({
        id: item.id,
        direction: 'incoming',
        message: item.body || item.media_caption || '',
        created_at: item.received_at,
        status: 'read',
        message_type: item.message_type || getMediaType(item),
        media_id: item.media_id || null,
        media_url: getMediaUrl(item) || null,
        media_mime_type: getMediaMime(item),
        media_filename: getMediaFilename(item),
        media_caption: item.media_caption || null,
        meta_message_id: item.whatsapp_message_id || null,
        error_message: null,
        source: 'wa_incoming_messages'
      })
    )

    const outgoingMessages = (outgoing || []).map((item) => {
      const metaId = cleanText(item.meta_message_id)
      const latest = metaId ? latestStatusMap.get(metaId) : null

      return normalizeMessage({
        id: item.id,
        direction: 'outgoing',
        message: item.message || item.media_caption || getAttachmentCaption(item) || '',
        created_at: item.sent_at || item.created_at,
        status: latest?.status || normalizeOutgoingStatus(item),
        message_type: item.message_type || getMediaType(item),
        media_id: item.media_id || null,
        media_url: getMediaUrl(item) || null,
        media_mime_type: getMediaMime(item),
        media_filename: getMediaFilename(item),
        media_caption: item.media_caption || item.attachment_caption || null,
        meta_message_id: metaId || null,
        error_message: latest?.error_message || item.error_message || null,
        source: 'wa_outgoing_messages'
      })
    })

    const deliveryMessages = deliveryLogs
      .filter((item) => {
        const metaId = getLogMetaMessageId(item)
        const message = getLogMessage(item)
        const mode = cleanText(item.mode).toLowerCase()
        const mediaUrl = getMediaUrl(item)

        if (mode === 'webhook_status' && !message && !mediaUrl) return false
        if (metaId && outgoingMetaIds.has(metaId)) return false
        if (!message && !mediaUrl) return false

        return true
      })
      .map((item) => {
        const metaId = getLogMetaMessageId(item)
        const latest = metaId ? latestStatusMap.get(metaId) : null

        return normalizeMessage({
          id: `delivery-${item.id || metaId || getLogCreatedAt(item)}`,
          direction: 'outgoing',
          message: getLogMessage(item) || getAttachmentCaption(item) || '',
          created_at: getLogCreatedAt(item),
          status: latest?.status || normalizeOutgoingStatus(item),
          message_type: getMediaType(item),
          media_id: item.media_id || null,
          media_url: getMediaUrl(item) || null,
          media_mime_type: getMediaMime(item),
          media_filename: getMediaFilename(item),
          media_caption: item.media_caption || item.attachment_caption || null,
          meta_message_id: metaId || null,
          error_message: latest?.error_message || item.error_message || null,
          source: 'send_delivery_logs'
        })
      })

    const jobItemMessages = jobItems
      .filter((item) => {
        const message = cleanText(item.message)
        const mediaUrl = getMediaUrl(item)
        const metaId = cleanText(item.meta_message_id || item.whatsapp_message_id)

        if (metaId && outgoingMetaIds.has(metaId)) return false
        return Boolean(message || mediaUrl)
      })
      .map((item) => {
        const metaId = cleanText(item.meta_message_id || item.whatsapp_message_id)
        const latest = metaId ? latestStatusMap.get(metaId) : null

        return normalizeMessage({
          id: `job-item-${item.id || metaId || item.created_at}`,
          direction: 'outgoing',
          message: item.message || item.media_caption || getAttachmentCaption(item) || '',
          created_at: item.sent_at || item.processed_at || item.updated_at || item.created_at || item.scheduled_at,
          status: latest?.status || normalizeOutgoingStatus(item),
          message_type: item.message_type || getMediaType(item),
          media_id: item.media_id || null,
          media_url: getMediaUrl(item) || null,
          media_mime_type: getMediaMime(item),
          media_filename: getMediaFilename(item),
          media_caption: item.media_caption || item.attachment_caption || null,
          meta_message_id: metaId || null,
          error_message: latest?.error_message || item.error_message || item.error || null,
          source: 'send_job_items',
          job_id: item.job_id || null,
          job_item_id: item.id || null,
          template_name: item.template_name || null
        })
      })

    const allMessages = dedupeMessages([
      ...incomingMessages,
      ...outgoingMessages,
      ...deliveryMessages,
      ...jobItemMessages
    ])
      .filter((item) => item.created_at)
      .sort((a, b) => getTime(a.created_at) - getTime(b.created_at))

    const filteredByCursor = beforeTime
      ? allMessages.filter((item) => getTime(item.created_at) < beforeTime)
      : allMessages

    let pageMessages = filteredByCursor.slice(-limit)
    let hasMore = filteredByCursor.length > limit

    if (focusItemId && !beforeTime) {
      const focusIndex = allMessages.findIndex((item) => {
        return (
          cleanText(item.job_item_id) === focusItemId ||
          cleanText(item.id) === 'job-item-' + focusItemId
        )
      })

      if (focusIndex >= 0) {
        const start = Math.max(0, focusIndex - 20)
        const end = Math.min(allMessages.length, focusIndex + 31)
        pageMessages = allMessages.slice(start, end)
        hasMore = start > 0
      }
    }

    const oldestCursor = pageMessages[0]?.created_at || null

    return res.status(200).json({
      success: true,
      phone,
      messages: pageMessages.map((item) => {
        const { sort_time, ...safe } = item
        return safe
      }),
      page: {
        limit,
        has_more: hasMore,
        oldest_cursor: oldestCursor,
        returned: pageMessages.length,
        total_loaded: allMessages.length
      }
    })
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Unauthorized'
    })
  }
}
