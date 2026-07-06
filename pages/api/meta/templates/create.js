import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { requireRole } from '../../../../lib/auth'

function cleanText(value) {
  return String(value || '').trim()
}

function upperText(value) {
  return cleanText(value).toUpperCase()
}

function getGraphVersion() {
  return cleanText(process.env.META_GRAPH_VERSION) || 'v20.0'
}

function getToken() {
  return (
    cleanText(process.env.META_WA_TOKEN) ||
    cleanText(process.env.WHATSAPP_TOKEN) ||
    cleanText(process.env.META_ACCESS_TOKEN)
  )
}

function getWabaId() {
  return (
    cleanText(process.env.META_WABA_ID) ||
    cleanText(process.env.META_WA_WABA_ID) ||
    cleanText(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID) ||
    '243741338818420'
  )
}

function getAppId() {
  return (
    cleanText(process.env.META_APP_ID) ||
    cleanText(process.env.FACEBOOK_APP_ID) ||
    '799882421972497'
  )
}

function sanitizeTemplateName(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeCategory(value) {
  const text = upperText(value)

  if (text === 'UTILITY') return 'UTILITY'
  if (text === 'AUTHENTICATION') return 'AUTHENTICATION'

  return 'MARKETING'
}

function normalizeLanguage(value) {
  return cleanText(value) || 'id'
}

function normalizeHeaderType(value) {
  const text = upperText(value)

  if (text === 'IMAGE') return 'IMAGE'
  if (text === 'VIDEO') return 'VIDEO'
  if (text === 'DOCUMENT') return 'DOCUMENT'

  return 'NONE'
}

function normalizeCampaignType(value, category) {
  const text = cleanText(value)

  if (!text) {
    if (normalizeCategory(category) === 'UTILITY') return 'Reminder'
    return 'Event'
  }

  const lower = text.toLowerCase()

  if (lower === 'event') return 'Event'
  if (lower === 'reminder') return 'Reminder'
  if (lower === 'promo') return 'Promo'
  if (lower === 'follow-up' || lower === 'follow up') return 'Follow-up'
  if (lower === 'other') return 'Other'

  return text
}

function normalizeMimeType(headerType, value) {
  const text = cleanText(value)

  if (text) return text

  if (headerType === 'IMAGE') return 'image/jpeg'
  if (headerType === 'VIDEO') return 'video/mp4'
  if (headerType === 'DOCUMENT') return 'application/pdf'

  return ''
}

function sanitizeUploadFilename(value, fallback = 'sample-file') {
  let text = cleanText(value)

  if (!text) text = fallback

  try {
    if (text.startsWith('http://') || text.startsWith('https://')) {
      const parsed = new URL(text)
      text = parsed.pathname.split('/').filter(Boolean).pop() || fallback
    }
  } catch (error) {
    // ignore
  }

  try {
    text = decodeURIComponent(text)
  } catch (error) {
    // ignore
  }

  text = text
    .replace(/[\\/<@%]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  if (!text) text = fallback

  return text
}

function guessFilename(url, fallback) {
  const provided = cleanText(fallback)

  if (provided) {
    return sanitizeUploadFilename(provided, 'sample-file')
  }

  try {
    const parsed = new URL(url)
    const last = parsed.pathname.split('/').filter(Boolean).pop()

    if (last) return sanitizeUploadFilename(last, 'sample-file')
  } catch (error) {
    // ignore
  }

  return 'sample-file'
}

function countBodyVariables(text) {
  const matches = Array.from(String(text || '').matchAll(/{{\s*(\d+)\s*}}/g))
  const numbers = matches
    .map((match) => Number(match[1]))
    .filter((num) => Number.isFinite(num))

  if (!numbers.length) return 0

  return Math.max(...numbers)
}

function parseBodyExamples(value, expectedCount) {
  if (Array.isArray(value)) {
    const arr = value.map(cleanText).filter(Boolean)

    if (expectedCount > 0) {
      while (arr.length < expectedCount) {
        arr.push(`Contoh ${arr.length + 1}`)
      }
    }

    return arr
  }

  const text = cleanText(value)

  if (!text && expectedCount <= 0) return []

  let arr = text
    .split('|')
    .map(cleanText)
    .filter(Boolean)

  if (arr.length <= 1 && text.includes(',')) {
    arr = text
      .split(',')
      .map(cleanText)
      .filter(Boolean)
  }

  if (expectedCount > 0) {
    while (arr.length < expectedCount) {
      arr.push(`Contoh ${arr.length + 1}`)
    }
  }

  return arr.slice(0, Math.max(expectedCount, arr.length))
}

function parseSimpleList(value, max = 3) {
  if (Array.isArray(value)) {
    return value.map(cleanText).filter(Boolean).slice(0, max)
  }

  const text = cleanText(value)

  if (!text) return []

  return text
    .split('|')
    .map(cleanText)
    .filter(Boolean)
    .slice(0, max)
}

function parseKeyValueButtons(value, max = 2) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'object') {
          return {
            text: cleanText(item.text || item.label || item.title),
            value: cleanText(item.url || item.phone || item.value)
          }
        }

        return null
      })
      .filter((item) => item?.text && item?.value)
      .slice(0, max)
  }

  const text = cleanText(value)

  if (!text) return []

  return text
    .split('|')
    .map(cleanText)
    .filter(Boolean)
    .map((item) => {
      const separatorIndex = item.indexOf('=')

      if (separatorIndex < 0) return null

      return {
        text: cleanText(item.slice(0, separatorIndex)),
        value: cleanText(item.slice(separatorIndex + 1))
      }
    })
    .filter((item) => item?.text && item?.value)
    .slice(0, max)
}

function normalizePhoneButtonNumber(value) {
  let phone = cleanText(value)

  if (phone.startsWith('+')) {
    return '+' + phone.replace(/\D/g, '')
  }

  phone = phone.replace(/\D/g, '')

  if (phone.startsWith('0')) {
    phone = '62' + phone.slice(1)
  }

  return `+${phone}`
}

function buildButtons({ quickReplyButtons, urlButtons, phoneButtons }) {
  const buttons = []

  const quickReplies = parseSimpleList(quickReplyButtons, 3)
  for (const text of quickReplies) {
    buttons.push({
      type: 'QUICK_REPLY',
      text
    })
  }

  const urls = parseKeyValueButtons(urlButtons, 2)
  for (const item of urls) {
    buttons.push({
      type: 'URL',
      text: item.text,
      url: item.value
    })
  }

  const phones = parseKeyValueButtons(phoneButtons, 1)
  for (const item of phones) {
    buttons.push({
      type: 'PHONE_NUMBER',
      text: item.text,
      phone_number: normalizePhoneButtonNumber(item.value)
    })
  }

  return buttons
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

async function uploadSampleMediaToMeta({
  token,
  appId,
  version,
  sampleUrl,
  filename,
  mimeType
}) {
  const fileResponse = await fetch(sampleUrl)

  if (!fileResponse.ok) {
    throw new Error(`Gagal download sample media. HTTP ${fileResponse.status}`)
  }

  const arrayBuffer = await fileResponse.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  if (!buffer.length) {
    throw new Error('Sample media kosong.')
  }

  const startUrl = new URL(`https://graph.facebook.com/${version}/${appId}/uploads`)
  startUrl.searchParams.set('file_name', filename)
  startUrl.searchParams.set('file_length', String(buffer.length))
  startUrl.searchParams.set('file_type', mimeType)

  const startResponse = await fetch(startUrl.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  const startData = await readJson(startResponse)

  if (!startResponse.ok || !startData.id) {
    throw new Error(`Gagal start upload media Meta: ${JSON.stringify(startData)}`)
  }

  const uploadResponse = await fetch(`https://graph.facebook.com/${version}/${startData.id}`, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${token}`,
      file_offset: '0',
      'Content-Type': 'application/octet-stream'
    },
    body: buffer
  })

  const uploadData = await readJson(uploadResponse)

  if (!uploadResponse.ok || !uploadData.h) {
    throw new Error(`Gagal upload sample media Meta: ${JSON.stringify(uploadData)}`)
  }

  return uploadData.h
}

function buildComponents({
  headerType,
  headerHandle,
  body,
  bodyExamples,
  footer,
  quickReplyButtons,
  urlButtons,
  phoneButtons
}) {
  const components = []

  if (headerType !== 'NONE') {
    components.push({
      type: 'HEADER',
      format: headerType,
      example: {
        header_handle: [headerHandle]
      }
    })
  }

  const bodyComponent = {
    type: 'BODY',
    text: body
  }

  const variableCount = countBodyVariables(body)

  if (variableCount > 0) {
    bodyComponent.example = {
      body_text: [
        bodyExamples.slice(0, variableCount)
      ]
    }
  }

  components.push(bodyComponent)

  if (cleanText(footer)) {
    components.push({
      type: 'FOOTER',
      text: cleanText(footer)
    })
  }

  const buttons = buildButtons({
    quickReplyButtons,
    urlButtons,
    phoneButtons
  })

  if (buttons.length) {
    components.push({
      type: 'BUTTONS',
      buttons
    })
  }

  return components
}

async function saveLocalTemplate(row) {
  const result = await supabaseAdmin
    .from('wa_templates')
    .upsert(row, {
      onConflict: 'name,language'
    })
    .select('*')
    .single()

  return result
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
    const wabaId = getWabaId()
    const appId = getAppId()
    const version = getGraphVersion()

    if (!token) {
      return res.status(500).json({
        success: false,
        message: 'META_WA_TOKEN belum diset di environment.'
      })
    }

    if (!wabaId) {
      return res.status(500).json({
        success: false,
        message: 'META_WABA_ID belum diset.'
      })
    }

    const bodyPayload = req.body || {}

    const name = sanitizeTemplateName(bodyPayload.name)
    const language = normalizeLanguage(bodyPayload.language)
    const category = normalizeCategory(bodyPayload.category)
    const campaignType = normalizeCampaignType(bodyPayload.campaign_type || bodyPayload.campaignType, category)
    const projectName = cleanText(bodyPayload.project_name || bodyPayload.projectName)
    const batchName = cleanText(bodyPayload.batch_name || bodyPayload.batchName)
    const headerType = normalizeHeaderType(bodyPayload.header_type || bodyPayload.headerType)
    const body = cleanText(bodyPayload.body)
    const footer = cleanText(bodyPayload.footer)

    const quickReplyButtons =
      bodyPayload.quick_reply_buttons ||
      bodyPayload.quickReplyButtons ||
      bodyPayload.buttons

    const urlButtons =
      bodyPayload.url_buttons ||
      bodyPayload.urlButtons

    const phoneButtons =
      bodyPayload.phone_buttons ||
      bodyPayload.phoneButtons

    const sampleUrl = cleanText(bodyPayload.sample_url || bodyPayload.sampleUrl)
    const sampleFilename = guessFilename(sampleUrl, bodyPayload.sample_filename || bodyPayload.sampleFilename)
    const sampleMimeType = normalizeMimeType(
      headerType,
      bodyPayload.sample_mime_type || bodyPayload.sampleMimeType
    )

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Template name wajib diisi. Gunakan huruf kecil, angka, dan underscore.'
      })
    }

    if (!body) {
      return res.status(400).json({
        success: false,
        message: 'Body template wajib diisi.'
      })
    }

    if (body.length > 1024) {
      return res.status(400).json({
        success: false,
        message: 'Body template maksimal 1.024 karakter. Pendekkan body dan taruh detail panjang di attachment.'
      })
    }

    if (headerType !== 'NONE' && !sampleUrl) {
      return res.status(400).json({
        success: false,
        message: 'Sample attachment URL wajib diisi untuk header IMAGE / DOCUMENT / VIDEO.'
      })
    }

    const variableCount = countBodyVariables(body)
    const bodyExamples = parseBodyExamples(
      bodyPayload.body_examples || bodyPayload.bodyExamples,
      variableCount
    )

    let headerHandle = null

    if (headerType !== 'NONE') {
      headerHandle = await uploadSampleMediaToMeta({
        token,
        appId,
        version,
        sampleUrl,
        filename: sampleFilename,
        mimeType: sampleMimeType
      })
    }

    const components = buildComponents({
      headerType,
      headerHandle,
      body,
      bodyExamples,
      footer,
      quickReplyButtons,
      urlButtons,
      phoneButtons
    })

    const metaPayload = {
      name,
      language,
      category,
      components
    }

    const response = await fetch(`https://graph.facebook.com/${version}/${wabaId}/message_templates`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metaPayload)
    })

    const metaData = await readJson(response)

    const localRow = {
      meta_template_id: metaData.id || null,
      name,
      language,
      category,
      campaign_type: campaignType || null,
      project_name: projectName || null,
      batch_name: batchName || null,
      status: metaData.status || (response.ok ? 'PENDING' : 'FAILED'),
      rejected_reason: metaData.rejected_reason || metaData.error?.message || null,
      quality_score: metaData.quality_score
        ? JSON.stringify(metaData.quality_score)
        : null,
      header_type: headerType,
      sample_url: sampleUrl || null,
      sample_filename: sampleFilename || null,
      sample_mime_type: sampleMimeType || null,
      body,
      footer: footer || null,
      body_examples: bodyExamples,
      components,
      meta_response: metaData,
      updated_at: new Date().toISOString()
    }

    const localResult = await saveLocalTemplate(localRow)

    if (localResult.error) {
      return res.status(500).json({
        success: false,
        message: localResult.error.message,
        meta: metaData
      })
    }

    if (!response.ok) {
      return res.status(400).json({
        success: false,
        message: metaData.error?.error_user_msg || metaData.error?.message || 'Meta menolak pembuatan template.',
        meta: metaData,
        local: localResult.data
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Template berhasil dikirim ke Meta.',
      template: localResult.data,
      meta: metaData
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal membuat template Meta.'
    })
  }
}