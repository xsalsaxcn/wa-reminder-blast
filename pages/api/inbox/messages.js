import { requireRole } from '../../../lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

function cleanPhone(phone) {
  return String(phone || '').replace(/\D/g, '')
}

function cleanText(value) {
  return String(value || '').trim()
}

function normalizeOutgoingStatus(item) {
  const status = cleanText(item.status).toLowerCase()

  if (status === 'read') return 'read'
  if (status === 'delivered') return 'delivered'
  if (status === 'failed') return 'failed'
  if (status === 'error') return 'failed'
  if (status === 'sent') return 'sent'
  if (status === 'success') return 'sent'
  if (status === 'processing') return 'processing'
  if (status === 'pending') return 'pending'

  if (item.error_message) return 'failed'
  if (item.meta_message_id) return 'sent'

  return status || 'sent'
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

    const messages = [
      ...(incoming || []).map((item) => ({
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
      })),
      ...(outgoing || []).map((item) => ({
        id: item.id,
        direction: 'outgoing',
        message: item.message || item.media_caption || '',
        created_at: item.sent_at || item.created_at,
        status: normalizeOutgoingStatus(item),
        message_type: item.message_type || 'text',
        media_id: item.media_id || null,
        media_mime_type: item.media_mime_type || null,
        media_filename: item.media_filename || null,
        media_caption: item.media_caption || null,
        meta_message_id: item.meta_message_id || null,
        error_message: item.error_message || null
      }))
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