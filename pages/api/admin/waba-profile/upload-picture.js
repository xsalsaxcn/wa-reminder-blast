import { requireRole } from '../../../../lib/auth'

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
  const appId = process.env.META_APP_ID
  const apiVersion = process.env.META_API_VERSION || 'v20.0'

  if (!token) throw new Error('META_WA_TOKEN belum di-set')
  if (!phoneNumberId) throw new Error('META_PHONE_NUMBER_ID belum di-set')
  if (!appId) throw new Error('META_APP_ID belum di-set')

  return {
    token,
    phoneNumberId,
    appId,
    apiVersion
  }
}

function parseBase64Image(base64) {
  const text = String(base64 || '')

  if (text.includes(',')) {
    return text.split(',').pop()
  }

  return text
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')

  try {
    await requireRole(req, res, ['master', 'admin'])

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const { token, phoneNumberId, appId, apiVersion } = getMetaConfig()

    const {
      fileName,
      mimeType,
      base64
    } = req.body || {}

    const cleanMimeType = String(mimeType || '').toLowerCase()

    if (!['image/jpeg', 'image/png'].includes(cleanMimeType)) {
      return res.status(400).json({
        success: false,
        message: 'Format foto harus JPG atau PNG'
      })
    }

    const rawBase64 = parseBase64Image(base64)
    const buffer = Buffer.from(rawBase64, 'base64')

    if (!buffer.length) {
      return res.status(400).json({
        success: false,
        message: 'File foto kosong'
      })
    }

    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'Ukuran foto maksimal 5 MB'
      })
    }

    const sessionUrl = new URL(`https://graph.facebook.com/${apiVersion}/${appId}/uploads`)
    sessionUrl.searchParams.set('file_length', String(buffer.length))
    sessionUrl.searchParams.set('file_type', cleanMimeType)
    sessionUrl.searchParams.set('file_name', String(fileName || 'waba-profile-picture.png'))

    const sessionResponse = await fetch(sessionUrl.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    const sessionData = await sessionResponse.json()

    if (!sessionResponse.ok || !sessionData?.id) {
      return res.status(sessionResponse.status || 500).json({
        success: false,
        message: sessionData?.error?.message || 'Gagal membuat upload session Meta',
        error: sessionData?.error || sessionData
      })
    }

    const uploadSessionId = sessionData.id

    const uploadResponse = await fetch(
      `https://graph.facebook.com/${apiVersion}/${uploadSessionId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `OAuth ${token}`,
          file_offset: '0',
          'Content-Type': cleanMimeType
        },
        body: buffer
      }
    )

    const uploadData = await uploadResponse.json()

    if (!uploadResponse.ok || !uploadData?.h) {
      return res.status(uploadResponse.status || 500).json({
        success: false,
        message: uploadData?.error?.message || 'Gagal upload file ke Meta',
        error: uploadData?.error || uploadData
      })
    }

    const pictureHandle = uploadData.h

    const updateUrl =
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}` +
      '/whatsapp_business_profile'

    const updateResponse = await fetch(updateUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        profile_picture_handle: pictureHandle
      })
    })

    const updateData = await updateResponse.json()

    if (!updateResponse.ok) {
      return res.status(updateResponse.status || 500).json({
        success: false,
        message: updateData?.error?.message || 'Gagal update profile picture WABA',
        error: updateData?.error || updateData
      })
    }

    return res.status(200).json({
      success: true,
      handle: pictureHandle,
      result: updateData
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload WABA profile picture'
    })
  }
}