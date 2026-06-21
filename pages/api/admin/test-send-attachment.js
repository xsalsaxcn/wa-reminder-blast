import { requireRole } from '../../../lib/auth'
import { sendWhatsAppMedia } from '../../../lib/whatsappSender'

export default async function handler(req, res) {
  try {
    await requireRole(req, res, ['master', 'admin'])

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const {
      phone,
      attachment_url,
      attachment_type,
      attachment_filename,
      attachment_caption
    } = req.body || {}

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'phone wajib diisi'
      })
    }

    if (!attachment_url) {
      return res.status(400).json({
        success: false,
        message: 'attachment_url wajib diisi'
      })
    }

    const result = await sendWhatsAppMedia({
      phone,
      message: attachment_caption || 'Test attachment',
      attachment_url,
      attachment_type: attachment_type || 'document',
      attachment_filename: attachment_filename || 'attachment.pdf',
      attachment_caption: attachment_caption || 'Test attachment dari WA Reminder Blast'
    })

    return res.status(200).json({
      success: true,
      mode: 'media',
      result
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal test kirim attachment'
    })
  }
}