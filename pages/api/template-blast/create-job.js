import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

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

function countBodyVariables(text) {
  const matches = Array.from(String(text || '').matchAll(/{{\s*(\d+)\s*}}/g))
  const numbers = matches
    .map((match) => Number(match[1]))
    .filter((num) => Number.isFinite(num))

  if (!numbers.length) return 0

  return Math.max(...numbers)
}

function normalizeParams(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean)

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

function getGreeting(name) {
  const text = cleanText(name)

  if (!text) return ''

  if (text.toLowerCase().startsWith('kak ')) return text.replace(/kak\s+/i, '').trim()

  const firstName = text.split(/\s+/)[0]

  return firstName
}

function buildParams(contact, template) {
  const requiredCount = countBodyVariables(template.body)
  let params = normalizeParams(contact.template_params)

  if (!params.length && requiredCount >= 1) {
    params = [getGreeting(contact.name)]
  }

  while (params.length < requiredCount) {
    params.push('-')
  }

  return params.slice(0, requiredCount)
}

function renderPreview(body, params) {
  let text = cleanText(body)

  params.forEach((value, index) => {
    const pattern = new RegExp(`{{\\s*${index + 1}\\s*}}`, 'g')
    text = text.replace(pattern, value)
  })

  return text
}

function normalizeHeaderType(value) {
  const text = cleanText(value).toUpperCase()

  if (text === 'IMAGE') return 'IMAGE'
  if (text === 'DOCUMENT') return 'DOCUMENT'
  if (text === 'VIDEO') return 'VIDEO'

  return 'NONE'
}

function parseTemplateComponents(value) {
  if (Array.isArray(value)) return value

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch (error) {
      return []
    }
  }

  return []
}

function getResponsiveUrlButton(template) {
  const components = parseTemplateComponents(template?.components)
  const group = components.find((component) => {
    return cleanText(component?.type).toUpperCase() === 'BUTTONS'
  })

  const buttons = Array.isArray(group?.buttons) ? group.buttons : []

  const index = buttons.findIndex((button) => {
    const type = cleanText(button?.type).toUpperCase()
    const url = cleanText(button?.url)

    return type === 'URL' && url.includes('/view-image?src={{1}}')
  })

  if (index < 0) return null

  return {
    index,
    text: cleanText(buttons[index]?.text),
    url: cleanText(buttons[index]?.url)
  }
}

function normalizeHttpUrl(value) {
  const raw = cleanText(value)

  if (!raw) return ''

  try {
    const parsed = new URL(raw)

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return ''
    }

    return parsed.toString()
  } catch (error) {
    return ''
  }
}

function buildTemplateParamsWithResponsiveButton({
  bodyParams,
  responsiveButton,
  responsiveImageUrl
}) {
  if (!responsiveButton) return bodyParams

  return {
    body: bodyParams,
    buttons: [
      {
        type: 'url',
        index: String(responsiveButton.index),
        text: encodeURIComponent(responsiveImageUrl)
      }
    ]
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    const authUser = await requireRole(req, res, ['master', 'admin', 'user', 'agent'])
    if (!authUser) return

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const body = req.body || {}
    const databaseId = cleanText(body.database_id || body.databaseId)
    const templateId = cleanText(body.template_id || body.templateId)
    const templateNameInput = cleanText(body.template_name || body.templateName)
    const requestedHeaderMediaId = cleanText(body.header_media_id || body.headerMediaId)
    const requestedHeaderMediaFilename = cleanText(body.header_media_filename || body.headerMediaFilename)
    const requestedResponsiveImageUrlRaw = cleanText(
      body.responsive_image_url || body.responsiveImageUrl
    )

    if (!databaseId) {
      return res.status(400).json({
        success: false,
        message: 'Pilih database kontak dulu.'
      })
    }

    if (!templateId && !templateNameInput) {
      return res.status(400).json({
        success: false,
        message: 'Pilih template approved dulu.'
      })
    }

    let templateQuery = supabaseAdmin
      .from('wa_templates')
      .select('*')
      .limit(1)

    if (templateId) {
      templateQuery = templateQuery.eq('id', templateId)
    } else {
      templateQuery = templateQuery.eq('name', templateNameInput)
    }

    const templateResult = await templateQuery.single()

    if (templateResult.error || !templateResult.data) {
      return res.status(404).json({
        success: false,
        message: templateResult.error?.message || 'Template tidak ditemukan.'
      })
    }

    const template = templateResult.data

    if (cleanText(template.status).toUpperCase() !== 'APPROVED') {
      return res.status(400).json({
        success: false,
        message: `Template belum APPROVED. Status sekarang: ${template.status || '-'}`
      })
    }

    const responsiveButton = getResponsiveUrlButton(template)
    const requestedResponsiveImageUrl = normalizeHttpUrl(requestedResponsiveImageUrlRaw)

    if (responsiveButton && !requestedResponsiveImageUrlRaw) {
      return res.status(400).json({
        success: false,
        message: 'Template ini memakai Responsive URL Button. Isi URL gambar asli dulu.'
      })
    }

    if (requestedResponsiveImageUrlRaw && !requestedResponsiveImageUrl) {
      return res.status(400).json({
        success: false,
        message: 'URL gambar asli tidak valid. Gunakan URL http/https.'
      })
    }

    if (requestedResponsiveImageUrl && !responsiveButton) {
      return res.status(400).json({
        success: false,
        message: 'Template ini belum memakai URL Button dinamis Notiva: https://wa-reminder-blast.vercel.app/view-image?src={{1}}'
      })
    }

    const databaseResult = await supabaseAdmin
      .from('contact_databases')
      .select('*')
      .eq('id', databaseId)
      .single()

    if (databaseResult.error) {
      return res.status(500).json({
        success: false,
        message: databaseResult.error.message
      })
    }

    const database = databaseResult.data || {}

    const contactsResult = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('database_id', databaseId)
      .limit(10000)

    if (contactsResult.error) {
      return res.status(500).json({
        success: false,
        message: contactsResult.error.message
      })
    }

    const contacts = Array.isArray(contactsResult.data) ? contactsResult.data : []

    if (!contacts.length) {
      return res.status(400).json({
        success: false,
        message: 'Database ini belum punya kontak.'
      })
    }

    const headerType = normalizeHeaderType(template.header_type)
    const jobName = `Template Blast - ${template.name} - ${new Date().toLocaleString('id-ID')}`

    const validItems = []
    const skipped = []

    for (const contact of contacts) {
      const phone = cleanPhone(contact.phone)
      const params = buildParams(contact, template)

      const itemHeaderMediaId = requestedHeaderMediaId

      const attachmentUrl =
        cleanText(contact.attachment_url) ||
        cleanText(database.default_attachment_url) ||
        cleanText(template.sample_url)

      const attachmentFilename =
        requestedHeaderMediaFilename ||
        cleanText(contact.attachment_filename) ||
        cleanText(database.default_attachment_filename) ||
        cleanText(template.sample_filename) ||
        'attachment'

      if (!phone) {
        skipped.push({
          name: contact.name,
          phone: contact.phone,
          reason: 'Nomor tidak valid.'
        })
        continue
      }

      if (headerType !== 'NONE' && !itemHeaderMediaId && !attachmentUrl) {
        skipped.push({
          name: contact.name,
          phone,
          reason: `Template ${template.name} butuh header_media_id atau attachment_url karena header ${headerType}.`
        })
        continue
      }

      validItems.push({
        phone,
        message: renderPreview(template.body, params),
        status: 'pending',
        scheduled_at: new Date().toISOString(),
        template_name: template.name,
        template_language: template.language || 'id',
        template_header_type: headerType,
        template_params: buildTemplateParamsWithResponsiveButton({
          bodyParams: params,
          responsiveButton,
          responsiveImageUrl: requestedResponsiveImageUrl
        }),
        ...(itemHeaderMediaId ? { header_media_id: itemHeaderMediaId } : {}),
        attachment_url: itemHeaderMediaId ? null : (attachmentUrl || null),
        attachment_type: headerType !== 'NONE' ? headerType.toLowerCase() : null,
        attachment_filename: attachmentFilename || null,
        attachment_caption: null
      })
    }

    if (!validItems.length) {
      return res.status(400).json({
        success: false,
        message: 'Tidak ada kontak valid untuk dibuat job.',
        skipped
      })
    }

    const jobResult = await supabaseAdmin
      .from('send_jobs')
      .insert({
        name: jobName,
        title: jobName,
        type: 'blast',
        send_mode: 'template',
        status: 'pending',
        database_id: databaseId,
        total_items: validItems.length
      })
      .select('*')
      .single()

    if (jobResult.error) {
      return res.status(500).json({
        success: false,
        message: jobResult.error.message
      })
    }

    const job = jobResult.data

    const rows = validItems.map((item) => ({
      ...item,
      job_id: job.id
    }))

    const insertResult = await supabaseAdmin
      .from('send_job_items')
      .insert(rows)

    if (insertResult.error) {
      return res.status(500).json({
        success: false,
        message: insertResult.error.message
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Template blast job berhasil dibuat.',
      job,
      items_created: rows.length,
      skipped,
      media_mode: requestedHeaderMediaId ? 'meta_media_id' : 'attachment_url_fallback',
      button_mode: responsiveButton ? 'responsive_url' : 'none',
      responsive_button_index: responsiveButton ? responsiveButton.index : null,
      responsive_viewer_url: responsiveButton && requestedResponsiveImageUrl
        ? `https://wa-reminder-blast.vercel.app/view-image?src=${encodeURIComponent(requestedResponsiveImageUrl)}`
        : null
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal membuat template blast job.'
    })
  }
}