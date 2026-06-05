function normalizePhone(phone) {
  if (!phone) return ''
  let value = String(phone).trim()
  value = value.replace(/[^\d+]/g, '')

  if (value.startsWith('0')) {
    value = '62' + value.slice(1)
  }

  if (value.startsWith('+')) {
    value = value.slice(1)
  }

  return value
}

async function callMetaWhatsApp(payload) {
  const token = process.env.META_WA_TOKEN
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID
  const version = process.env.META_API_VERSION || 'v20.0'

  if (!token || !phoneNumberId) {
    return {
      ok: false,
      error: 'META_WA_TOKEN atau META_PHONE_NUMBER_ID belum diisi di .env.local'
    }
  }

  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  const data = await response.json()

  if (!response.ok) {
    return {
      ok: false,
      error: data?.error?.message || JSON.stringify(data),
      raw: data
    }
  }

  return {
    ok: true,
    messageId: data?.messages?.[0]?.id || null,
    raw: data
  }
}

async function sendWhatsAppText({ phone, message }) {
  const to = normalizePhone(phone)

  return callMetaWhatsApp({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: {
      preview_url: false,
      body: message
    }
  })
}

async function sendWhatsAppTemplate({ phone, templateName, languageCode = 'id', variables = [] }) {
  const to = normalizePhone(phone)

  const components = variables.length > 0
    ? [
        {
          type: 'body',
          parameters: variables.map((item) => ({
            type: 'text',
            text: String(item)
          }))
        }
      ]
    : []

  return callMetaWhatsApp({
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode
      },
      components
    }
  })
}

export {
  normalizePhone,
  sendWhatsAppText,
  sendWhatsAppTemplate
}
