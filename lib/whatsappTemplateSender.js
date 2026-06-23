function cleanText(value) {
  return String(value || '').trim()
}

function cleanPhone(value) {
  let phone = String(value || '').trim()
  let result = ''

  if (phone.startsWith('="')) phone = phone.slice(2)
  if (phone.endsWith('"')) phone = phone.slice(0, -1)
  if (phone.startsWith("'")) phone = phone.slice(1)

  for (const char of phone) {
    if ('0123456789'.includes(char)) result += char
  }

  if (result.startsWith('0')) result = '62' + result.slice(1)

  return result
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

function getGraphVersion() {
  return cleanText(process.env.META_GRAPH_VERSION) || 'v20.0'
}

function normalizeHeaderType(value) {
  const text = cleanText(value).toUpperCase()

  if (text === 'IMAGE') return 'IMAGE'
  if (text === 'DOCUMENT') return 'DOCUMENT'
  if (text === 'VIDEO') return 'VIDEO'

  return 'NONE'
}

function normalizeParams(value) {
  if (Array.isArray(value)) {
    return value.map(cleanText).filter(Boolean)
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map(cleanText).filter(Boolean)
    } catch (error) {
      return value.split('|').map(cleanText).filter(Boolean)
    }
  }

  return []
}

function buildHeaderComponent({ headerType, attachmentUrl, attachmentFilename }) {
  const type = normalizeHeaderType(headerType)

  if (type === 'NONE') return null

  const link = cleanText(attachmentUrl)

  if (!link) {
    throw new Error(`attachment_url wajib diisi untuk template header ${type}.`)
  }

  if (type === 'IMAGE') {
    return {
      type: 'header',
      parameters: [
        {
          type: 'image',
          image: {
            link
          }
        }
      ]
    }
  }

  if (type === 'VIDEO') {
    return {
      type: 'header',
      parameters: [
        {
          type: 'video',
          video: {
            link
          }
        }
      ]
    }
  }

  if (type === 'DOCUMENT') {
    return {
      type: 'header',
      parameters: [
        {
          type: 'document',
          document: {
            link,
            filename: cleanText(attachmentFilename) || 'attachment.pdf'
          }
        }
      ]
    }
  }

  return null
}

function buildBodyComponent(params) {
  const values = normalizeParams(params)

  if (!values.length) return null

  return {
    type: 'body',
    parameters: values.map((value) => ({
      type: 'text',
      text: value
    }))
  }
}

async function readMetaResponse(response) {
  const text = await response.text()

  try {
    return JSON.parse(text)
  } catch (error) {
    return {
      raw: text
    }
  }
}

export async function sendWhatsAppTemplate({
  to,
  templateName,
  language = 'id',
  headerType = 'NONE',
  attachmentUrl = '',
  attachmentFilename = '',
  params = []
}) {
  const token = getToken()
  const phoneNumberId = getPhoneNumberId()
  const version = getGraphVersion()
  const phone = cleanPhone(to)

  if (!token) {
    throw new Error('META_WA_TOKEN belum diset di environment.')
  }

  if (!phoneNumberId) {
    throw new Error('META_PHONE_NUMBER_ID belum diset di environment.')
  }

  if (!phone) {
    throw new Error('Nomor tujuan kosong/tidak valid.')
  }

  if (!cleanText(templateName)) {
    throw new Error('templateName wajib diisi.')
  }

  const components = []

  const headerComponent = buildHeaderComponent({
    headerType,
    attachmentUrl,
    attachmentFilename
  })

  const bodyComponent = buildBodyComponent(params)

  if (headerComponent) components.push(headerComponent)
  if (bodyComponent) components.push(bodyComponent)

  const payload = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: cleanText(templateName),
      language: {
        code: cleanText(language) || 'id'
      }
    }
  }

  if (components.length) {
    payload.template.components = components
  }

  const response = await fetch(
    `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  )

  const data = await readMetaResponse(response)

  if (!response.ok) {
    throw new Error(data.error?.message || JSON.stringify(data))
  }

  return {
    success: true,
    mode: 'template',
    meta_message_id: data.messages?.[0]?.id || null,
    response: data,
    payload
  }
}