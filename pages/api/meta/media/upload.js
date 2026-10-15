import { createHash } from 'crypto'
import { requireRole } from '../../../../lib/auth'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '12mb'
    }
  }
}

function cleanText(value) {
  return String(value || '').trim()
}

function getGraphVersion() {
  return cleanText(process.env.META_GRAPH_VERSION || process.env.META_API_VERSION) || 'v20.0'
}

function getToken() {
  return (
    cleanText(process.env.META_WA_TOKEN) ||
    cleanText(process.env.WHATSAPP_TOKEN) ||
    cleanText(process.env.META_ACCESS_TOKEN)
  )
}

function getPhoneNumberId() {
  return (
    cleanText(process.env.META_PHONE_NUMBER_ID) ||
    cleanText(process.env.META_WA_PHONE_NUMBER_ID) ||
    cleanText(process.env.WHATSAPP_PHONE_NUMBER_ID)
  )
}

function parseBase64(base64) {
  const text = String(base64 || '')
  return text.includes(',') ? text.split(',').pop() : text
}

function normalizeMediaType(mimeType) {
  const mime = cleanText(mimeType).toLowerCase()

  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'

  return 'document'
}

function sanitizeFilename(value, fallback = 'campaign-media') {
  let text = cleanText(value) || fallback

  text = text
    .replace(/[\\/<@%]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  return text || fallback
}

async function readJson(response) {
  const text = await response.text()

  try {
    return JSON.parse(text)
  } catch (error) {
    return {
      raw: text
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    const authUser = requireRole(req, res, ['master', 'admin'])
    if (!authUser) return

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const token = getToken()
    const phoneNumberId = getPhoneNumberId()
    const version = getGraphVersion()

    if (!token) {
      return res.status(500).json({
        success: false,
        message: 'META_WA_TOKEN belum diset.'
      })
    }

    if (!phoneNumberId) {
      return res.status(500).json({
        success: false,
        message: 'META_PHONE_NUMBER_ID belum diset.'
      })
    }

    const body = req.body || {}
    const assetName = cleanText(body.asset_name || body.assetName)
    const campaignName = cleanText(body.campaign_name || body.campaignName)
    const fileName = sanitizeFilename(body.file_name || body.fileName || body.filename)
    const mimeType = cleanText(body.mime_type || body.mimeType)
    const base64 = cleanText(body.base64)

    if (!base64) {
      return res.status(400).json({
        success: false,
        message: 'File base64 wajib dikirim.'
      })
    }

    if (!mimeType) {
      return res.status(400).json({
        success: false,
        message: 'MIME type wajib dikirim.'
      })
    }

    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'application/pdf'
    ]

    if (!allowedMimeTypes.includes(mimeType.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Format belum didukung. Gunakan JPG, PNG, WEBP, MP4, atau PDF.'
      })
    }

    const buffer = Buffer.from(parseBase64(base64), 'base64')

    if (!buffer.length) {
      return res.status(400).json({
        success: false,
        message: 'File kosong.'
      })
    }

    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'Ukuran file maksimal 10 MB. Kompres dulu agar blast lebih ringan.'
      })
    }

    const uploadForm = new FormData()
    uploadForm.append('messaging_product', 'whatsapp')
    uploadForm.append('file', new Blob([buffer], { type: mimeType }), fileName)

    const uploadResponse = await fetch(
      `https://graph.facebook.com/${version}/${phoneNumberId}/media`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: uploadForm
      }
    )

    const uploadData = await readJson(uploadResponse)

    if (!uploadResponse.ok || !uploadData?.id) {
      return res.status(uploadResponse.status || 500).json({
        success: false,
        message: uploadData?.error?.message || 'Gagal upload media ke Meta.',
        meta: uploadData
      })
    }

    const sha256 = createHash('sha256').update(buffer).digest('hex')
    const mediaType = normalizeMediaType(mimeType)

    const insertResult = await supabaseAdmin
      .from('wa_media_assets')
      .insert({
        asset_name: assetName || fileName,
        campaign_name: campaignName || null,
        media_type: mediaType,
        mime_type: mimeType,
        filename: fileName,
        meta_media_id: uploadData.id,
        sha256,
        file_size: buffer.length,
        status: 'active',
        meta_response: uploadData,
        updated_at: new Date().toISOString()
      })
      .select('*')
      .single()

    if (insertResult.error) {
      return res.status(500).json({
        success: false,
        message: insertResult.error.message,
        meta_media_id: uploadData.id,
        meta: uploadData
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Media berhasil diupload ke Meta.',
      media: insertResult.data,
      meta_media_id: uploadData.id,
      meta: uploadData
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal upload media ke Meta.'
    })
  }
}