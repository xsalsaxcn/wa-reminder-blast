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

export function cleanPhone(phone) {
  return String(phone || '')
    .replace(/\D/g, '')
    .replace(/^0/, '62')
}

export function cleanAttachmentType(type, url = '') {
  const raw = String(type || '').trim().toLowerCase()
  const lowerUrl = String(url || '').toLowerCase()

  if (raw === 'image' || raw === 'document') return raw

  if (
    lowerUrl.endsWith('.jpg') ||
    lowerUrl.endsWith('.jpeg') ||
    lowerUrl.endsWith('.png') ||
    lowerUrl.endsWith('.webp')
  ) {
    return 'image'
  }

  return 'document'
}

export function guessFilenameFromUrl(url, fallback = 'attachment') {
  try {
    const parsed = new URL(url)
    const last = parsed.pathname.split('/').filter(Boolean).pop()

    if (last) return decodeURIComponent(last)
  } catch (err) {
    // ignore
  }

  return fallback
}

function guessMimeTypeFromFilename(filename = '') {
  const lower = String(filename || '').toLowerCase()

  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.doc')) return 'application/msword'
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel'
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }

  return 'application/octet-stream'
}

function normalizeMimeType(contentType, filename) {
  const clean = String(contentType || '').split(';')[0].trim().toLowerCase()

  if (clean && clean !== 'application/octet-stream' && clean !== 'binary/octet-stream') {
    return clean
  }

  return guessMimeTypeFromFilename(filename)
}

function validateMimeType(mimeType) {
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

  return allowedMimeTypes.includes(String(mimeType || '').toLowerCase())
}

export function normalizeAttachment(row = {}) {
  const attachmentUrl = String(row.attachment_url || '').trim()

  if (!attachmentUrl) {
    return {
      hasAttachment: false,
      attachment_url: '',
      attachment_type: '',
      attachment_filename: '',
      attachment_caption: ''
    }
  }

  const attachmentType = cleanAttachmentType(row.attachment_type, attachmentUrl)
  const attachmentFilename =
    String(row.attachment_filename || '').trim() ||
    guessFilenameFromUrl(
      attachmentUrl,
      attachmentType === 'image' ? 'image.jpg' : 'document.pdf'
    )

  const attachmentCaption =
    String(row.attachment_caption || '').trim() ||
    String(row.message || '').trim() ||
    ''

  return {
    hasAttachment: true,
    attachment_url: attachmentUrl,
    attachment_type: attachmentType,
    attachment_filename: attachmentFilename,
    attachment_caption: attachmentCaption
  }
}

async function downloadAttachment({ attachment_url, attachment_filename }) {
  if (!attachment_url) {
    throw new Error('Attachment URL kosong')
  }

  let parsedUrl

  try {
    parsedUrl = new URL(attachment_url)
  } catch (err) {
    throw new Error('Attachment URL tidak valid')
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Attachment URL harus HTTPS')
  }

  const response = await fetch(attachment_url, {
    method: 'GET',
    headers: {
      'User-Agent': 'WA-Reminder-Blast/1.0'
    }
  })

  if (!response.ok) {
    throw new Error(`Gagal download attachment. HTTP ${response.status}`)
  }

  const filename =
    String(attachment_filename || '').trim() ||
    guessFilenameFromUrl(attachment_url, 'attachment')

  const mimeType = normalizeMimeType(response.headers.get('content-type'), filename)

  if (!validateMimeType(mimeType)) {
    throw new Error(`Format attachment tidak didukung: ${mimeType}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  if (!buffer.length) {
    throw new Error('Attachment kosong')
  }

  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('Attachment terlalu besar. Maksimal 5 MB untuk blast/reminder.')
  }

  return {
    buffer,
    filename,
    mimeType,
    size: buffer.length
  }
}

async function uploadMediaToMeta({ buffer, filename, mimeType }) {
  const { token, phoneNumberId, apiVersion } = getMetaConfig()

  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('file', new Blob([buffer], { type: mimeType }), filename)

  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: form
    }
  )

  const data = await response.json()

  if (!response.ok || !data?.id) {
    throw new Error(data?.error?.message || 'Gagal upload attachment ke Meta')
  }

  return data.id
}

export async function sendWhatsAppText({ phone, message }) {
  const { token, phoneNumberId, apiVersion } = getMetaConfig()
  const clean = cleanPhone(phone)

  if (!clean) throw new Error('Phone kosong')
  if (!String(message || '').trim()) throw new Error('Message kosong')

  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: clean,
        type: 'text',
        text: {
          preview_url: true,
          body: String(message || '').trim()
        }
      })
    }
  )

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.error?.message || 'Gagal kirim WhatsApp text')
  }

  return data
}

export async function sendWhatsAppMedia({
  phone,
  message,
  attachment_url,
  attachment_type,
  attachment_filename,
  attachment_caption
}) {
  const { token, phoneNumberId, apiVersion } = getMetaConfig()
  const clean = cleanPhone(phone)

  if (!clean) throw new Error('Phone kosong')
  if (!attachment_url) throw new Error('Attachment URL kosong')

  const normalized = normalizeAttachment({
    message,
    attachment_url,
    attachment_type,
    attachment_filename,
    attachment_caption
  })

  const downloaded = await downloadAttachment({
    attachment_url: normalized.attachment_url,
    attachment_filename: normalized.attachment_filename
  })

  const mediaId = await uploadMediaToMeta({
    buffer: downloaded.buffer,
    filename: downloaded.filename,
    mimeType: downloaded.mimeType
  })

  const finalType =
    downloaded.mimeType.startsWith('image/')
      ? 'image'
      : normalized.attachment_type || 'document'

  const payload =
    finalType === 'image'
      ? {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: clean,
          type: 'image',
          image: {
            id: mediaId,
            caption: normalized.attachment_caption || undefined
          }
        }
      : {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: clean,
          type: 'document',
          document: {
            id: mediaId,
            filename: downloaded.filename,
            caption: normalized.attachment_caption || undefined
          }
        }

  const response = await fetch(
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

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.error?.message || 'Gagal kirim WhatsApp media')
  }

  return {
    ...data,
    uploaded_media_id: mediaId
  }
}

export async function sendWhatsAppMessage(row = {}) {
  const attachment = normalizeAttachment(row)

  if (attachment.hasAttachment) {
    return sendWhatsAppMedia({
      phone: row.phone,
      message: row.message,
      attachment_url: attachment.attachment_url,
      attachment_type: attachment.attachment_type,
      attachment_filename: attachment.attachment_filename,
      attachment_caption: attachment.attachment_caption
    })
  }

  return sendWhatsAppText({
    phone: row.phone,
    message: row.message
  })
}