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

    const phone = String(req.query.phone || '').trim()

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone is required'
      })
    }

    const { data: incoming, error: incomingError } = await supabaseAdmin
      .from('wa_incoming_messages')
      .select('*')
      .eq('phone', phone)
      .order('received_at', { ascending: true })

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

    if (outgoingError) {
      return res.status(500).json({
        success: false,
        message: outgoingError.message
      })
    }

    const messages = [
      ...(incoming || []).map((item) => ({
        id: item.id,
        direction: 'incoming',
        phone: item.phone,
        profile_name: item.profile_name,
        message: item.body || '',
        message_type: item.message_type,
        created_at: item.received_at
      })),
      ...(outgoing || []).map((item) => ({
        id: item.id,
        direction: 'outgoing',
        phone: item.phone,
        profile_name: null,
        message: item.message || '',
        message_type: 'text',
        status: item.status,
        error_message: item.error_message,
        created_at: item.sent_at
      }))
    ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

    return res.status(200).json({
      success: true,
      messages
    })
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Unauthorized'
    })
  }
}