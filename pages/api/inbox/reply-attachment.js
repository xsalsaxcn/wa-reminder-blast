import { requireRole } from '../../../lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb'
    }
  }
}

function getMetaConfig() {
  const token = process.env.META_WA_TOKEN
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID
  const apiVersion = process.env.META_API_VERSION || 'v20.0'

  if (!token) throw new Error('META_WA_TOKEN belum di-set')
  if (!phoneNumberId) throw new Error('META_PHONE_NUMBER_ID belum di-set')

  return {
    token,
    phoneNumberId,
    apiVersion
  }
}

function cleanPhone(phone) {
  return String(phone || '')
    .replace(/\D/g, '')
    .replace(/^0/, '62')
}

function parseBase64(base64) {
  const text = String(base64 || '')
  return text.includes(',') ? text.split(',').pop() : text
}

function getMessageType(mimeType) {
  if (String(mimeType || '').startsWith('image/')) return 'image'
  return 'document'
}

export default async function handler(req, res) {
  try {
    await requireRole(req, res, ['master', 'admin', 'user', 'agent'])

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const { phone, caption, fileName, mimeType, base64 } = req.body || {}

    const clean = cleanPhone(phone)
    const cleanCaption = String(caption || '').trim()
    const cleanFileName = String(fileName || 'attachment').trim()
    const cleanMimeType = String(mimeType || '').trim().toLowerCase()

    if (!clean) {
      return res.status(400).json({
        success: false,
        message: 'Nomor WhatsApp wajib diisi'
      })
    }

    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]

    if (!allowedMimeTypes.includes(cleanMimeType)) {
      return res.status(400).json({
        success: false,
        message: 'Format attachment belum didukung. Gunakan JPG, PNG, WEBP, PDF, DOC/DOCX, atau XLS/XLSX.'
      })
    }

    const buffer = Buffer.from(parseBase64(base64), 'base64')

    if (!buffer.length) {
      return res.status(400).json({
        success: false,
        message: 'File attachment kosong'
      })
    }

    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'Ukuran file maksimal 5 MB'
      })
    }

    const { token, phoneNumberId, apiVersion } = getMetaConfig()

    const uploadForm = new FormData()
    uploadForm.append('messaging_product', 'whatsapp')
    uploadForm.append('file', new Blob([buffer], { type: cleanMimeType }), cleanFileName)

    const uploadResponse = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: uploadForm
      }
    )

    const uploadData = await uploadResponse.json()

    if (!uploadResponse.ok || !uploadData?.id) {
      return res.status(uploadResponse.status || 500).json({
        success: false,
        message: uploadData?.error?.message || 'Gagal upload media ke Meta',
        error: uploadData?.error || uploadData
      })
    }

    const mediaId = uploadData.id
    const messageType = getMessageType(cleanMimeType)

    const payload =
      messageType === 'image'
        ? {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: clean,
            type: 'image',
            image: {
              id: mediaId,
              caption: cleanCaption || undefined
            }
          }
        : {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: clean,
            type: 'document',
            document: {
              id: mediaId,
              filename: cleanFileName,
              caption: cleanCaption || undefined
            }
          }

    const sendResponse = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )

    const sendData = await sendResponse.json()

    if (!sendResponse.ok) {
      await supabaseAdmin.from('wa_outgoing_messages').insert({
        phone: clean,
        message: cleanCaption || cleanFileName,
        status: 'failed',
        error_message: sendData?.error?.message || 'Gagal kirim attachment',
        message_type: messageType,
        media_id: mediaId,
        media_mime_type: cleanMimeType,
        media_filename: cleanFileName,
        media_caption: cleanCaption,
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      })

      return res.status(sendResponse.status || 500).json({
        success: false,
        message: sendData?.error?.message || 'Gagal kirim attachment',
        error: sendData?.error || sendData
      })
    }

    const metaMessageId = sendData?.messages?.[0]?.id || null

    const { error: insertError } = await supabaseAdmin
      .from('wa_outgoing_messages')
      .insert({
        phone: clean,
        message: cleanCaption || cleanFileName,
        status: 'sent',
        meta_message_id: metaMessageId,
        message_type: messageType,
        media_id: mediaId,
        media_mime_type: cleanMimeType,
        media_filename: cleanFileName,
        media_caption: cleanCaption,
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      })

    if (insertError) {
      return res.status(500).json({
        success: false,
        message: insertError.message
      })
    }

    await supabaseAdmin
      .from('wa_conversations')
      .upsert(
        {
          phone: clean,
          last_message: cleanCaption || `[${messageType}] ${cleanFileName}`,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        { onConflict: 'phone' }
      )

    return res.status(200).json({
      success: true,
      media_id: mediaId,
      meta_message_id: metaMessageId,
      result: sendData
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to send attachment'
    })
  }
}