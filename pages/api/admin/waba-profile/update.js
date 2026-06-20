import { requireRole } from '../../../../lib/auth'

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

function cleanWebsites(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 2)
  }

  return String(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2)
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

    const { token, phoneNumberId, apiVersion } = getMetaConfig()

    const {
      about,
      address,
      description,
      email,
      websites,
      vertical
    } = req.body || {}

    const payload = {
      messaging_product: 'whatsapp',
      about: String(about || '').trim(),
      address: String(address || '').trim(),
      description: String(description || '').trim(),
      email: String(email || '').trim(),
      websites: cleanWebsites(websites),
      vertical: String(vertical || 'HEALTH').trim() || 'HEALTH'
    }

    const url =
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}` +
      '/whatsapp_business_profile'

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    const data = await response.json()

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: data?.error?.message || 'Gagal update WABA profile',
        error: data?.error || data
      })
    }

    return res.status(200).json({
      success: true,
      result: data
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update WABA profile'
    })
  }
}