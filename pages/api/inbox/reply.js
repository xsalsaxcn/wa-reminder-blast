import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'
import { sendWhatsAppText } from '../../../lib/metaWhatsapp'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin', 'user'])
  if (!authUser) return

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const { phone, message } = req.body

    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        message: 'phone dan message wajib diisi'
      })
    }

    const result = await sendWhatsAppText({
      phone,
      message
    })

    await supabaseAdmin
      .from('wa_outgoing_messages')
      .insert({
        phone,
        message,
        status: result.ok ? 'sent' : 'failed',
        meta_message_id: result.messageId || null,
        error_message: result.error || null,
        sent_by: authUser.username || authUser.id || null
      })

    await supabaseAdmin
      .from('wa_conversations')
      .upsert(
        {
          phone,
          last_message: message,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          onConflict: 'phone'
        }
      )

    if (!result.ok) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Gagal mengirim reply'
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Reply berhasil dikirim',
      messageId: result.messageId
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Reply gagal'
    })
  }
}
