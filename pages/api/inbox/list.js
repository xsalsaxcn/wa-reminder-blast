import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    await requireRole(req, res, ['master', 'admin', 'user'])

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

    if (conversations && conversations.length > 0) {
      return res.status(200).json({
        success: true,
        conversations
      })
    }

    const { data: incomingMessages, error: incomingError } = await supabaseAdmin
      .from('wa_incoming_messages')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(100)

    if (incomingError) {
      return res.status(500).json({
        success: false,
        message: incomingError.message
      })
    }

    const map = new Map()

    for (const msg of incomingMessages || []) {
      if (!msg.phone) continue

      if (!map.has(msg.phone)) {
        map.set(msg.phone, {
          id: msg.phone,
          phone: msg.phone,
          profile_name: msg.profile_name || msg.phone,
          last_message: msg.body || '',
          last_message_at: msg.received_at,
          unread_count: 1,
          status: 'open',
          created_at: msg.received_at,
          updated_at: msg.received_at
        })
      }
    }

    const fallbackConversations = Array.from(map.values())

    return res.status(200).json({
      success: true,
      conversations: fallbackConversations
    })
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Unauthorized'
    })
  }
}