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

    const mergedConversations = Array.from(mergedMap.values()).sort((a, b) => {
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