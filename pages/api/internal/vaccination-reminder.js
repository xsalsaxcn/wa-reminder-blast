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
  else if (digits.startsWith('8')) digits = `62${digits}`

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
    secret:
      cleanText(process.env.VACCINATION_REMINDER_INTERNAL_SECRET) ||
      cleanText(process.env.VACCINATION_QUEUE_INTERNAL_SECRET),
    templateName:
      cleanText(process.env.VACCINATION_REMINDER_TEMPLATE_NAME) ||
      'vaccination_reminder_due',
    templateLanguage:
      cleanText(process.env.VACCINATION_REMINDER_TEMPLATE_LANGUAGE) ||
      cleanText(process.env.VACCINATION_QUEUE_TEMPLATE_LANGUAGE) ||
      'id'
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

function buildTemplateParams({ placeholderCount, recipientName, serviceName, dueDate, reminderStage }) {
  const values = [recipientName, serviceName, dueDate, reminderStage]

  if (placeholderCount !== 4) {
    throw new Error(
      `Template Vaccination Reminder harus memiliki tepat 4 parameter: nama, layanan, tanggal dosis, reminder. Saat ini: ${placeholderCount}.`
    )
  }

  const params = values.slice(0, placeholderCount)
  if (params.some((value) => !cleanText(value))) {
    throw new Error('Parameter template Vaccination Reminder belum lengkap.')
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

async function loadApprovedTemplate(config) {
  const result = await supabaseAdmin
    .from('wa_templates')
    .select('name,language,status,category,header_type,body,components,updated_at')
    .eq('name', config.templateName)
    .eq('language', config.templateLanguage)
    .limit(1)

  if (result.error) throw new Error(result.error.message)

  const template = Array.isArray(result.data) ? result.data[0] : null
  if (!template) {
    throw new Error(
      `Template ${config.templateName} (${config.templateLanguage}) belum ditemukan di wa_templates.`
    )
  }

  if (cleanText(template.status).toUpperCase() !== 'APPROVED') {
    throw new Error(
      `Template ${config.templateName} belum APPROVED. Status saat ini: ${cleanText(template.status) || 'UNKNOWN'}.`
    )
  }

  const category = cleanText(template.category).toUpperCase()
  if (category && category !== 'UTILITY') {
    throw new Error(`Template Vaccination Reminder harus kategori UTILITY. Category saat ini: ${category}.`)
  }

  const headerType = cleanText(template.header_type).toUpperCase() || 'NONE'
  if (headerType !== 'NONE') {
    throw new Error(`Template Vaccination Reminder harus tanpa header. Header saat ini: ${headerType}.`)
  }

  const placeholderCount = getPlaceholderCount(template.body)
  if (placeholderCount !== 4) {
    throw new Error(
      `Template Vaccination Reminder harus memiliki tepat 4 placeholder. Saat ini: ${placeholderCount}.`
    )
  }

  return { ...template, placeholderCount }
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

      if (!existing.error && Array.isArray(existing.data) && existing.data.length) return
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
      console.error('vaccination reminder saveOutgoingHistorySafe failed:', insertResult.error.message)
    }
  } catch (error) {
    console.error('vaccination reminder saveOutgoingHistorySafe failed:', error.message)
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
      message: 'VACCINATION_REMINDER_INTERNAL_SECRET / VACCINATION_QUEUE_INTERNAL_SECRET belum diset.'
    })
  }

  const suppliedSecret = req.headers['x-vaccination-reminder-secret']
  if (!secureEqual(suppliedSecret, config.secret)) return unauthorized(res)

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      code: 'METHOD_NOT_ALLOWED',
      message: 'Method not allowed'
    })
  }

  try {
    const template = await loadApprovedTemplate(config)

    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        bridge: 'vaccination_reminder_v1',
        configured: true,
        automatic_schedule: ['H3', 'H1'],
        accepted_manual_stages: ['H7', 'H3', 'H1', 'H0'],
        template: {
          name: template.name,
          language: template.language,
          status: template.status,
          category: template.category || null,
          header_type: template.header_type || 'NONE',
          placeholder_count: template.placeholderCount
        }
      })
    }

    const phone = cleanPhone(req.body?.phone)
    const recipientName = cleanText(req.body?.recipient_name || req.body?.participant_name || req.body?.name)
    const serviceName = cleanText(req.body?.service_name || req.body?.vaccine_name)
    const dueDate = cleanText(req.body?.due_date || req.body?.next_due_date)
    const reminderStage = cleanText(req.body?.reminder_stage).toUpperCase()

    if (!/^62\d{8,13}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PHONE',
        message: 'Nomor WhatsApp tidak valid. Gunakan nomor Indonesia, contoh 081234567890 atau 6281234567890.'
      })
    }

    if (!recipientName) {
      return res.status(400).json({ success: false, code: 'NAME_REQUIRED', message: 'recipient_name wajib diisi.' })
    }
    if (!serviceName) {
      return res.status(400).json({ success: false, code: 'SERVICE_REQUIRED', message: 'service_name wajib diisi.' })
    }
    if (!dueDate) {
      return res.status(400).json({ success: false, code: 'DUE_DATE_REQUIRED', message: 'due_date wajib diisi.' })
    }
    if (!['H7', 'H3', 'H1', 'H0'].includes(reminderStage)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_REMINDER_STAGE',
        message: 'Reminder stage harus H7, H3, H1, atau H0.'
      })
    }

    const reminderLabelMap = { H7: 'H-7', H3: 'H-3', H1: 'H-1', H0: 'Hari H' }
    const reminderLabel = reminderLabelMap[reminderStage]
    const params = buildTemplateParams({
      placeholderCount: template.placeholderCount,
      recipientName,
      serviceName,
      dueDate,
      reminderStage: reminderLabel
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
        channel: 'vaccination_reminder',
        mode: 'vaccination_reminder_template',
        meta_message_id: metaMessageId,
        meta_response: sendResult || null
      })

      await saveOutgoingHistorySafe({ phone, message: renderedMessage, metaMessageId, sentAt })

      return res.status(200).json({
        success: true,
        channel: 'whatsapp',
        mode: 'vaccination_reminder_template',
        phone,
        reminder_stage: reminderStage,
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
        channel: 'vaccination_reminder',
        mode: 'vaccination_reminder_template',
        error_message: sendError.message || 'Gagal kirim WhatsApp Vaccination Reminder.'
      })

      return res.status(502).json({
        success: false,
        code: 'WHATSAPP_SEND_FAILED',
        message: sendError.message || 'Gagal kirim WhatsApp Vaccination Reminder.'
      })
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'BRIDGE_ERROR',
      message: error.message || 'Vaccination Reminder bridge gagal diproses.'
    })
  }
}
