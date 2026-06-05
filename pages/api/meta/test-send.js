import { sendWhatsAppText, sendWhatsAppTemplate } from '../../../lib/metaWhatsapp'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin'])
  if (!authUser) return

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const {
      mode,
      phone,
      message,
      templateName,
      languageCode,
      variables
    } = req.body

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Nomor WhatsApp wajib diisi'
      })
    }

    let result

    if (mode === 'template') {
      if (!templateName) {
        return res.status(400).json({
          success: false,
          message: 'Nama template wajib diisi'
        })
      }

      result = await sendWhatsAppTemplate({
        phone,
        templateName,
        languageCode: languageCode || 'id',
        variables: Array.isArray(variables) ? variables : []
      })
    } else {
      if (!message) {
        return res.status(400).json({
          success: false,
          message: 'Message wajib diisi'
        })
      }

      result = await sendWhatsAppText({
        phone,
        message
      })
    }

    if (!result.ok) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Gagal kirim WhatsApp',
        raw: result.raw || null
      })
    }

    return res.status(200).json({
      success: true,
      message: 'WhatsApp berhasil dikirim',
      messageId: result.messageId,
      raw: result.raw
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    })
  }
}
