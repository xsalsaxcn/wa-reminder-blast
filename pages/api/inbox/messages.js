import { requireRole } from '../../../lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

function cleanPhone(phone) {
  return String(phone || '').replace(/\D/g, '')
}

function cleanText(value) {
  return String(value || '').trim()
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

async function getDeliveryLogs(phone) {
  try {
    const { data, error } = await supabaseAdmin
      .from('send_delivery_logs')
      .select('*')
      .eq('phone', phone)
      .order('created_at', { ascending: true })
      .limit(500)

    if (error) return []

    return data || []
  } catch (error) {
    return []
  }
}

async function getLatestStatusesByMetaId(metaIds) {
  const ids = Array.from(new Set((metaIds || []).map(cleanText).filter(Boolean)))

  if (!ids.length) return new Map()

  try {
    const { data, error } = await supabaseAdmin
      .from('send_delivery_logs')
      .select('*')
      .in('meta_message_id', ids)
      .order('created_at', { ascending: true })
      .limit(1000)

    if (error) return new Map()

    const map = new Map()

    for (const item of data || []) {
      const metaId = getLogMetaMessageId(item)
      if (!metaId) continue

      map.set(metaId, {
        status: normalizeOutgoingStatus(item),
        created_at: getLogCreatedAt(item)
      })
    }

    return map
  } catch (error) {
    return new Map()
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

    const phone = cleanPhone(req.query.phone)

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone is required'
      })
    }

    await markConversationRead(phone)

    const { data: incoming, error: incomingError } = await supabaseAdmin
      .from('wa_incoming_messages')
      .select('*')
      .eq('phone', phone)
      .order('received_at', { ascending: true })
      .limit(500)

    if (incomingError) {
      return res.status(500).json({
        success: false,
        message: incomingError.message
      })
    }

    const { data: outgoing, error: outgoingError } = await supabaseAdmin
      .from('wa_outgoing_messages')
      .select('*')
      .eq('phone', phone)
      .order('sent_at', { ascending: true })
      .limit(500)

    if (outgoingError) {
      return res.status(500).json({
        success: false,
        message: outgoingError.message
      })
    }

    const deliveryLogs = await getDeliveryLogs(phone)

    const outgoingMetaIds = new Set(
      (outgoing || [])
        .map((item) => cleanText(item.meta_message_id))
        .filter(Boolean)
    )

    const deliveryMetaIds = deliveryLogs
      .map(getLogMetaMessageId)
      .filter(Boolean)

    const allMetaIds = [
      ...(outgoing || []).map((item) => cleanText(item.meta_message_id)).filter(Boolean),
      ...deliveryMetaIds
    ]

    const latestStatusMap = await getLatestStatusesByMetaId(allMetaIds)

    const incomingMessages = (incoming || []).map((item) => ({
      id: item.id,
      direction: 'incoming',
      message: item.body || item.media_caption || '',
      created_at: item.received_at,
      status: 'read',
      message_type: item.message_type || 'text',
      media_id: item.media_id || null,
      media_mime_type: item.media_mime_type || null,
      media_filename: item.media_filename || null,
      media_caption: item.media_caption || null,
      meta_message_id: item.whatsapp_message_id || null,
      error_message: null
    }))

    const outgoingMessages = (outgoing || []).map((item) => {
      const metaId = cleanText(item.meta_message_id)
      const latest = metaId ? latestStatusMap.get(metaId) : null

      return {
        id: item.id,
        direction: 'outgoing',
        message: item.message || item.media_caption || '',
        created_at: item.sent_at || item.created_at,
        status: latest?.status || normalizeOutgoingStatus(item),
        message_type: item.message_type || 'text',
        media_id: item.media_id || null,
        media_mime_type: item.media_mime_type || null,
        media_filename: item.media_filename || null,
        media_caption: item.media_caption || null,
        meta_message_id: metaId || null,
        error_message: item.error_message || null
      }
    })

    const deliveryMessages = deliveryLogs
      .filter((item) => {
        const metaId = getLogMetaMessageId(item)
        const message = getLogMessage(item)
        const mode = cleanText(item.mode).toLowerCase()

        if (mode === 'webhook_status' && !message) return false
        if (metaId && outgoingMetaIds.has(metaId)) return false
        if (!message) return false

        return true
      })
      .map((item) => {
        const metaId = getLogMetaMessageId(item)
        const latest = metaId ? latestStatusMap.get(metaId) : null

        return {
          id: `delivery-${item.id || metaId || getLogCreatedAt(item)}`,
          direction: 'outgoing',
          message: getLogMessage(item),
          created_at: getLogCreatedAt(item),
          status: latest?.status || normalizeOutgoingStatus(item),
          message_type: cleanText(item.mode) || 'text',
          media_id: null,
          media_mime_type: null,
          media_filename: null,
          media_caption: null,
          meta_message_id: metaId || null,
          error_message: item.error_message || null
        }
      })

    const messages = [
      ...incomingMessages,
      ...outgoingMessages,
      ...deliveryMessages
    ].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))

    return res.status(200).json({
      success: true,
      phone,
      messages
    })
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Unauthorized'
    })
  }
}