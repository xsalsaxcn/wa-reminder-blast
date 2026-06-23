import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function cleanText(value) {
  return String(value || '').trim()
}

function toNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
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
      const msgTime = msg.received_at ? new Date(msg.received_at).getTime() : 0
      const existingTime = existing?.last_message_at ? new Date(existing.last_message_at).getTime() : 0

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

    const mergedConversations = Array.from(mergedMap.values()).sort((a, b) => {
      return new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0)
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