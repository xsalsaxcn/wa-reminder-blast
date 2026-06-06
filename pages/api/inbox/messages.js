import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin', 'user'])
  if (!authUser) return

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const { phone } = req.query

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'phone wajib diisi'
      })
    }

    const [incomingResult, outgoingResult] = await Promise.all([
      supabaseAdmin
        .from('wa_incoming_messages')
        .select('*')
        .eq('phone', phone)
        .order('received_at', { ascending: true }),

      supabaseAdmin
        .from('wa_outgoing_messages')
        .select('*')
        .eq('phone', phone)
        .order('sent_at', { ascending: true })
    ])

    if (incomingResult.error) throw incomingResult.error
    if (outgoingResult.error) throw outgoingResult.error

    const incoming = (incomingResult.data || []).map((item) => ({
      id: item.id,
      direction: 'in',
      phone: item.phone,
      text: item.body,
      message_type: item.message_type,
      created_at: item.received_at,
      status: 'received'
    }))

    const outgoing = (outgoingResult.data || []).map((item) => ({
      id: item.id,
      direction: 'out',
      phone: item.phone,
      text: item.message,
      created_at: item.sent_at,
      status: item.status,
      error_message: item.error_message
    }))

    const messages = [...incoming, ...outgoing].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    )

    await supabaseAdmin
      .from('wa_conversations')
      .update({
        unread_count: 0,
        updated_at: new Date().toISOString()
      })
      .eq('phone', phone)

    return res.status(200).json({
      success: true,
      data: messages
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal mengambil messages'
    })
  }
}
