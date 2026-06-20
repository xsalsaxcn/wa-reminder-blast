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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')

  try {
    await requireRole(req, res, ['master', 'admin'])

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const { token, phoneNumberId, apiVersion } = getMetaConfig()

    const fields = [
      'about',
      'address',
      'description',
      'email',
      'profile_picture_url',
      'websites',
      'vertical'
    ].join(',')

    const url =
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}` +
      `/whatsapp_business_profile?fields=${encodeURIComponent(fields)}`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    const data = await response.json()

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: data?.error?.message || 'Gagal mengambil WABA profile',
        error: data?.error || data
      })
    }

    return res.status(200).json({
      success: true,
      profile: data?.data?.[0] || null,
      raw: data
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to get WABA profile'
    })
  }
}