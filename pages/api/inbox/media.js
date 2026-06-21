import { requireRole } from '../../../lib/auth'

function getMetaConfig() {
  const token = process.env.META_WA_TOKEN
  const apiVersion = process.env.META_API_VERSION || 'v20.0'

  if (!token) throw new Error('META_WA_TOKEN belum di-set')

  return {
    token,
    apiVersion
  }
}

export default async function handler(req, res) {
  try {
    await requireRole(req, res, ['master', 'admin', 'user', 'agent'])

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const mediaId = String(req.query.media_id || '').trim()
    const filename = String(req.query.filename || 'attachment').trim()

    if (!mediaId) {
      return res.status(400).json({
        success: false,
        message: 'media_id wajib diisi'
      })
    }

    const { token, apiVersion } = getMetaConfig()

    const metaResponse = await fetch(
      `https://graph.facebook.com/${apiVersion}/${mediaId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    const metaData = await metaResponse.json()

    if (!metaResponse.ok || !metaData?.url) {
      return res.status(metaResponse.status || 500).json({
        success: false,
        message: metaData?.error?.message || 'Gagal mengambil URL media',
        error: metaData?.error || metaData
      })
    }

    const mediaResponse = await fetch(metaData.url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!mediaResponse.ok) {
      return res.status(mediaResponse.status || 500).json({
        success: false,
        message: 'Gagal download media dari Meta'
      })
    }

    const arrayBuffer = await mediaResponse.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const contentType =
      mediaResponse.headers.get('content-type') ||
      metaData.mime_type ||
      'application/octet-stream'

    res.setHeader('Cache-Control', 'private, max-age=120')
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `inline; filename="${filename.replace(/"/g, '')}"`)

    return res.status(200).send(buffer)
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to load media'
    })
  }
}