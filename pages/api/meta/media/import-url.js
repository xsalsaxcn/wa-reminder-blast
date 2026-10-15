import { createHash } from 'crypto'
import dns from 'dns/promises'
import net from 'net'
import { requireRole } from '../../../../lib/auth'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '256kb'
    }
  }
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_REDIRECTS = 3

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

function isPrivateIpv4(ip) {
  const parts = ip.split('.').map((value) => Number(value))
  if (parts.length !== 4 || parts.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return true
  }

  const [a, b] = parts

  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a >= 224) return true

  return false
}

function isPrivateIpv6(ip) {
  const value = String(ip || '').toLowerCase()

  if (!value || value === '::' || value === '::1') return true
  if (value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) {
    return true
  }

  if (value.startsWith('fc') || value.startsWith('fd')) return true

  if (value.startsWith('::ffff:')) {
    const mapped = value.slice('::ffff:'.length)
    if (net.isIP(mapped) === 4) return isPrivateIpv4(mapped)
  }

  return false
}

function isBlockedIp(ip) {
  const version = net.isIP(ip)

  if (version === 4) return isPrivateIpv4(ip)
  if (version === 6) return isPrivateIpv6(ip)

  return true
}

async function validatePublicUrl(rawUrl) {
  let parsed

  try {
    parsed = new URL(cleanText(rawUrl))
  } catch (error) {
    throw new Error('URL gambar tidak valid.')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('URL gambar harus menggunakan http atau https.')
  }

  if (parsed.username || parsed.password) {
    throw new Error('URL dengan username/password tidak diizinkan.')
  }

  const hostname = parsed.hostname.toLowerCase()

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  ) {
    throw new Error('Host lokal tidak diizinkan.')
  }

  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new Error('Alamat IP privat/lokal tidak diizinkan.')
    }

    return parsed
  }

  const addresses = await dns.lookup(hostname, {
    all: true,
    verbatim: true
  })

  if (!addresses.length) {
    throw new Error('Hostname URL gambar tidak dapat di-resolve.')
  }

  if (addresses.some((entry) => isBlockedIp(entry.address))) {
    throw new Error('URL gambar mengarah ke jaringan privat/lokal.')
  }

  return parsed
}

async function fetchPublicImage(rawUrl) {
  let current = await validatePublicUrl(rawUrl)

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(current.toString(), {
      method: 'GET',
      redirect: 'manual',
      headers: {
        Accept: 'image/jpeg,image/png,image/webp;q=0.9,*/*;q=0.1',
        'User-Agent': 'Notiva-Media-Importer/1.0'
      }
    })

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')

      if (!location) {
        throw new Error('Redirect URL gambar tidak memiliki target.')
      }

      if (redirectCount >= MAX_REDIRECTS) {
        throw new Error('Redirect URL gambar terlalu banyak.')
      }

      current = await validatePublicUrl(new URL(location, current).toString())
      continue
    }

    if (!response.ok) {
      throw new Error(`Gagal mengambil URL gambar. HTTP ${response.status}.`)
    }

    const mimeType = cleanText(response.headers.get('content-type'))
      .split(';')[0]
      .toLowerCase()

    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp'
    ]

    if (!allowedMimeTypes.includes(mimeType)) {
      throw new Error(
        `URL harus mengarah langsung ke JPG, PNG, atau WEBP. Content-Type sekarang: ${mimeType || '-'}`
      )
    }

    const contentLength = Number(response.headers.get('content-length') || 0)

    if (contentLength && contentLength > MAX_IMAGE_BYTES) {
      throw new Error('Ukuran gambar maksimal 10 MB.')
    }

    if (!response.body) {
      throw new Error('Response gambar kosong.')
    }

    const reader = response.body.getReader()
    const chunks = []
    let total = 0

    while (true) {
      const { done, value } = await reader.read()

      if (done) break
      if (!value?.length) continue

      total += value.length

      if (total > MAX_IMAGE_BYTES) {
        try {
          await reader.cancel()
        } catch (error) {
          // no-op
        }

        throw new Error('Ukuran gambar maksimal 10 MB.')
      }

      chunks.push(Buffer.from(value))
    }

    if (!total) {
      throw new Error('File gambar dari URL kosong.')
    }

    return {
      buffer: Buffer.concat(chunks, total),
      mimeType,
      finalUrl: current
    }
  }

  throw new Error('Gagal mengambil URL gambar.')
}

function sanitizeFilename(value, fallback = 'url-image') {
  let text = cleanText(value) || fallback

  text = text
    .replace(/[\\/<@%?&=:#]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  return text || fallback
}

function extensionFromMime(mimeType) {
  if (mimeType === 'image/png') return '.png'
  if (mimeType === 'image/webp') return '.webp'
  return '.jpg'
}

function buildFilename(finalUrl, mimeType) {
  const pathname = cleanText(finalUrl?.pathname)
  const lastPart = pathname ? pathname.split('/').filter(Boolean).pop() : ''
  const sanitized = sanitizeFilename(lastPart || 'url-image')
  const hasExtension = /\.[a-z0-9]{2,5}$/i.test(sanitized)

  return hasExtension
    ? sanitized
    : `${sanitized}${extensionFromMime(mimeType)}`
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
    const authUser = await requireRole(req, res, ['master', 'admin'])
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
    const imageUrl = cleanText(body.image_url || body.imageUrl || body.url)
    const assetName = cleanText(body.asset_name || body.assetName)
    const campaignName = cleanText(body.campaign_name || body.campaignName)

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Image URL wajib diisi.'
      })
    }

    const fetched = await fetchPublicImage(imageUrl)
    const filename = buildFilename(fetched.finalUrl, fetched.mimeType)

    const uploadForm = new FormData()
    uploadForm.append('messaging_product', 'whatsapp')
    uploadForm.append(
      'file',
      new Blob([fetched.buffer], { type: fetched.mimeType }),
      filename
    )

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
        message: uploadData?.error?.message || 'Gagal upload Image URL ke Meta.',
        meta: uploadData
      })
    }

    const sha256 = createHash('sha256').update(fetched.buffer).digest('hex')

    const insertResult = await supabaseAdmin
      .from('wa_media_assets')
      .insert({
        asset_name: assetName || filename,
        campaign_name: campaignName || null,
        media_type: 'image',
        mime_type: fetched.mimeType,
        filename,
        meta_media_id: uploadData.id,
        sha256,
        file_size: fetched.buffer.length,
        status: 'active',
        meta_response: {
          ...uploadData,
          source: 'url_import',
          source_host: fetched.finalUrl.hostname
        },
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
      message: 'Image URL berhasil diambil 1x dan disiapkan sebagai Meta Media ID.',
      media: insertResult.data,
      meta_media_id: uploadData.id,
      source_host: fetched.finalUrl.hostname,
      file_size: fetched.buffer.length
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal menyiapkan Image URL.'
    })
  }
}
