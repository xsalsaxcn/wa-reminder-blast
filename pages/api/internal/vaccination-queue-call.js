import crypto from 'crypto'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { saveDeliveryLog } from '../../../lib/sendDeliveryLog'
import { sendWhatsAppTemplate } from '../../../lib/whatsappTemplateSender'

function cleanText(value) {
  return String(value || '').trim()
}

function cleanPhone(value) {
  let phone = cleanText(value)
  let digits = ''

  if (phone.startsWith('="')) phone = phone.slice(2)
  if (phone.endsWith('"')) phone = phone.slice(0, -1)
  if (phone.startsWith("'")) phone = phone.slice(1)

  for (const char of phone) {
    if ('0123456789'.includes(char)) digits += char
  }

  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`

  return digits
}

function secureEqual(left, right) {
  const a = Buffer.from(cleanText(left))
  const b = Buffer.from(cleanText(right))

  if (!a.length || !b.length || a.length !== b.length) return false

  return crypto.timingSafeEqual(a, b)
}

function getConfig() {
  return {
    secret: cleanText(process.env.VACCINATION_QUEUE_INTERNAL_SECRET),
    calledTemplateName: cleanText(process.env.VACCINATION_QUEUE_TEMPLATE_NAME),
    prepareTemplateName:
      cleanText(process.env.VACCINATION_QUEUE_PREPARE_TEMPLATE_NAME) ||
      'vaccination_queue_prepare',
    templateLanguage: cleanText(process.env.VACCINATION_QUEUE_TEMPLATE_LANGUAGE) || 'id'
  }
}

function getPlaceholderCount(body) {
  const text = cleanText(body)
  const numbers = new Set()
  const regex = /\{\{\s*(\d+)\s*\}\}/g
  let match = null

  while ((match = regex.exec(text)) !== null) {
    numbers.add(Number(match[1]))
  }

  if (!numbers.size) return 0

  const ordered = [...numbers].sort((a, b) => a - b)
  const max = ordered[ordered.length - 1]

  for (let index = 1; index <= max; index += 1) {
    if (!numbers.has(index)) {
      throw new Error(`Placeholder template tidak berurutan. {{${index}}} tidak ditemukan.`)
    }
  }

  return max
}

function buildTemplateParams({ placeholderCount, participantName, queueNumber, sessionName }) {
  const values = [participantName, queueNumber, sessionName]

  if (placeholderCount > values.length) {
    throw new Error(
      `Template membutuhkan ${placeholderCount} parameter. Bridge Vaccination V1.2 mendukung maksimal 3: nama, nomor antrean, session.`
    )
  }

  const params = values.slice(0, placeholderCount)

  if (params.some((value) => !cleanText(value))) {
    throw new Error('Parameter template belum lengkap untuk template Vaccination Queue yang dipilih.')
  }

  return params
}

function renderTemplateBody(body, params) {
  let rendered = cleanText(body)

  params.forEach((value, index) => {
    const placeholder = new RegExp(`\\{\\{\\s*${index + 1}\\s*\\}\\}`, 'g')
    rendered = rendered.replace(placeholder, cleanText(value))
  })

  return rendered
}

async function loadApprovedTemplate({ templateName, templateLanguage, envName }) {
  if (!templateName) {
    throw new Error(`${envName} belum diset di environment.`)
  }

  const result = await supabaseAdmin
    .from('wa_templates')
    .select('name,language,status,category,header_type,body,components,updated_at')
    .eq('name', templateName)
    .eq('language', templateLanguage)
    .limit(1)

  if (result.error) throw new Error(result.error.message)

  const template = Array.isArray(result.data) ? result.data[0] : null

  if (!template) {
    throw new Error(
      `Template ${templateName} (${templateLanguage}) belum ditemukan di wa_templates.`
    )
  }

  if (cleanText(template.status).toUpperCase() !== 'APPROVED') {
    throw new Error(
      `Template ${templateName} belum APPROVED. Status saat ini: ${cleanText(template.status) || 'UNKNOWN'}.`
    )
  }

  const category = cleanText(template.category).toUpperCase()
  if (category && category !== 'UTILITY') {
    throw new Error(
      `Template Vaccination Queue sebaiknya kategori UTILITY. Category saat ini: ${category}.`
    )
  }

  const headerType = cleanText(template.header_type).toUpperCase() || 'NONE'

  if (headerType !== 'NONE' && headerType !== 'TEXT') {
    throw new Error(
      `Template Vaccination Queue V1.2 harus tanpa media header. Header saat ini: ${headerType}.`
    )
  }

  return template
}

async function saveOutgoingHistorySafe({ phone, message, metaMessageId, sentAt }) {
  try {
    if (!phone || !message) return

    if (metaMessageId) {
      const existing = await supabaseAdmin
        .from('wa_outgoing_messages')
        .select('id')
        .eq('meta_message_id', metaMessageId)
        .limit(1)

      if (!existing.error && Array.isArray(existing.data) && existing.data.length) {
        return
      }
    }

    const insertResult = await supabaseAdmin
      .from('wa_outgoing_messages')
      .insert({
        phone,
        message,
        status: 'sent',
        meta_message_id: metaMessageId || null,
        message_type: 'template',
        sent_at: sentAt,
        created_at: sentAt
      })

    if (insertResult.error) {
      console.error('vaccination queue saveOutgoingHistorySafe failed:', insertResult.error.message)
    }
  } catch (error) {
    // History tidak boleh menggagalkan WA yang sudah sukses terkirim.
    console.error('vaccination queue saveOutgoingHistorySafe failed:', error.message)
  }
}

function unauthorized(res) {
  return res.status(401).json({
    success: false,
    code: 'UNAUTHORIZED',
    message: 'Unauthorized'
  })
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  const config = getConfig()

  if (!config.secret) {
    return res.status(503).json({
      success: false,
      code: 'BRIDGE_NOT_CONFIGURED',
      message: 'VACCINATION_QUEUE_INTERNAL_SECRET belum diset di Notiva environment.'
    })
  }

  const suppliedSecret = req.headers['x-vaccination-queue-secret']

  if (!secureEqual(suppliedSecret, config.secret)) {
    return unauthorized(res)
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      code: 'METHOD_NOT_ALLOWED',
      message: 'Method not allowed'
    })
  }

  try {
    const calledTemplate = await loadApprovedTemplate({
      templateName: config.calledTemplateName,
      templateLanguage: config.templateLanguage,
      envName: 'VACCINATION_QUEUE_TEMPLATE_NAME'
    })

    const prepareTemplate = await loadApprovedTemplate({
      templateName: config.prepareTemplateName,
      templateLanguage: config.templateLanguage,
      envName: 'VACCINATION_QUEUE_PREPARE_TEMPLATE_NAME'
    })

    const calledPlaceholderCount = getPlaceholderCount(calledTemplate.body)
    const preparePlaceholderCount = getPlaceholderCount(prepareTemplate.body)

    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        bridge: 'vaccination_queue_v1_2',
        configured: true,
        templates: {
          called: {
            name: calledTemplate.name,
            language: calledTemplate.language,
            status: calledTemplate.status,
            category: calledTemplate.category || null,
            header_type: calledTemplate.header_type || 'NONE',
            placeholder_count: calledPlaceholderCount
          },
          prepare: {
            name: prepareTemplate.name,
            language: prepareTemplate.language,
            status: prepareTemplate.status,
            category: prepareTemplate.category || null,
            header_type: prepareTemplate.header_type || 'NONE',
            placeholder_count: preparePlaceholderCount
          }
        }
      })
    }

    const notificationType = cleanText(
      req.body?.notification_type || req.body?.type || 'called'
    ).toLowerCase()

    if (!['called', 'prepare'].includes(notificationType)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_NOTIFICATION_TYPE',
        message: 'notification_type harus called atau prepare.'
      })
    }

    const template = notificationType === 'prepare' ? prepareTemplate : calledTemplate
    const placeholderCount =
      notificationType === 'prepare'
        ? preparePlaceholderCount
        : calledPlaceholderCount

    const phone = cleanPhone(req.body?.phone)
    const participantName = cleanText(req.body?.participant_name || req.body?.name)
    const queueNumber = cleanText(req.body?.queue_number)
    const sessionName = cleanText(req.body?.session_name)

    if (!/^62\d{8,13}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PHONE',
        message: 'Nomor WhatsApp tidak valid. Gunakan nomor Indonesia, contoh 081234567890 atau 6281234567890.'
      })
    }

    if (!participantName) {
      return res.status(400).json({
        success: false,
        code: 'NAME_REQUIRED',
        message: 'participant_name wajib diisi.'
      })
    }

    if (!queueNumber) {
      return res.status(400).json({
        success: false,
        code: 'QUEUE_NUMBER_REQUIRED',
        message: 'queue_number wajib diisi.'
      })
    }

    const params = buildTemplateParams({
      placeholderCount,
      participantName,
      queueNumber,
      sessionName
    })

    const renderedMessage = renderTemplateBody(template.body, params)

    try {
      const sendResult = await sendWhatsAppTemplate({
        to: phone,
        templateName: template.name,
        language: template.language || config.templateLanguage,
        headerType: 'NONE',
        params
      })

      const sentAt = new Date().toISOString()
      const metaMessageId = sendResult?.meta_message_id || null

      await saveDeliveryLog({
        phone,
        message: renderedMessage,
        status: 'success',
        channel: 'vaccination_queue',
        mode:
          notificationType === 'prepare'
            ? 'vaccination_queue_prepare_template'
            : 'vaccination_queue_called_template',
        meta_message_id: metaMessageId,
        meta_response: sendResult || null
      })

      await saveOutgoingHistorySafe({
        phone,
        message: renderedMessage,
        metaMessageId,
        sentAt
      })

      return res.status(200).json({
        success: true,
        channel: 'whatsapp',
        mode:
          notificationType === 'prepare'
            ? 'vaccination_queue_prepare_template'
            : 'vaccination_queue_called_template',
        notification_type: notificationType,
        phone,
        queue_number: queueNumber,
        template: {
          name: template.name,
          language: template.language || config.templateLanguage
        },
        meta_message_id: metaMessageId,
        sent_at: sentAt
      })
    } catch (sendError) {
      await saveDeliveryLog({
        phone,
        message: renderedMessage,
        status: 'failed',
        channel: 'vaccination_queue',
        mode:
          notificationType === 'prepare'
            ? 'vaccination_queue_prepare_template'
            : 'vaccination_queue_called_template',
        error_message: sendError.message || 'Gagal kirim WhatsApp Vaccination Queue.'
      })

      return res.status(502).json({
        success: false,
        code: 'WHATSAPP_SEND_FAILED',
        message: sendError.message || 'Gagal kirim WhatsApp Vaccination Queue.'
      })
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'BRIDGE_ERROR',
      message: error.message || 'Vaccination Queue bridge gagal diproses.'
    })
  }
}
