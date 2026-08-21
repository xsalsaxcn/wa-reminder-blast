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
  if (phone.startsWith('+')) phone = phone.slice(1)

  for (const char of phone) {
    if ('0123456789'.includes(char)) result += char
  }

  if (result.startsWith('0')) result = '62' + result.slice(1)

  return result
}

function phoneVariants(value) {
  const raw = cleanText(value)
  const clean = cleanPhone(raw)
  const variants = new Set()

  if (raw) variants.add(raw)
  if (clean) {
    variants.add(clean)
    variants.add('+' + clean)

    if (clean.startsWith('62')) {
      variants.add('0' + clean.slice(2))
    }
  }

  return Array.from(variants).filter(Boolean)
}

function getTime(value) {
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

function toLimit(value) {
  const number = Number(value)

  if (!Number.isFinite(number) || number <= 0) return 80

  return Math.min(200, Math.max(30, Math.floor(number)))
}

function parseRaw(value) {
  if (!value) return {}

  if (typeof value === 'object') return value

  try {
    return JSON.parse(value)
  } catch (error) {
    return {}
  }
}

function getIncomingPhone(row) {
  return cleanPhone(row?.phone || row?.from || row?.wa_id || row?.sender_phone || row?.customer_phone || '')
}

function getOutgoingPhone(row) {
  return cleanPhone(row?.phone || row?.to || row?.wa_id || row?.recipient_phone || row?.customer_phone || '')
}

function getBody(row) {
  const raw = parseRaw(row?.raw)

  return (
    cleanText(row?.body) ||
    cleanText(row?.message) ||
    cleanText(row?.text) ||
    cleanText(row?.content) ||
    cleanText(row?.caption) ||
    cleanText(row?.media_caption) ||
    cleanText(row?.template_name) ||
    cleanText(raw?.body) ||
    cleanText(raw?.message) ||
    cleanText(raw?.text?.body) ||
    cleanText(raw?.template?.name) ||
    ''
  )
}

function getIncomingTime(row) {
  return row?.received_at || row?.message_created_at || row?.created_at || row?.updated_at || ''
}

function getOutgoingTime(row) {
  return row?.sent_at || row?.created_at || row?.updated_at || row?.processed_at || ''
}

function getJobItemTime(row) {
  return row?.processed_at || row?.scheduled_at || row?.created_at || row?.updated_at || ''
}

function getMediaUrl(row) {
  const raw = parseRaw(row?.raw)

  return (
    cleanText(row?.media_url) ||
    cleanText(row?.attachment_url) ||
    cleanText(row?.file_url) ||
    cleanText(row?.url) ||
    cleanText(row?.image_url) ||
    cleanText(row?.document_url) ||
    cleanText(raw?.media_url) ||
    cleanText(raw?.attachment_url) ||
    ''
  )
}

function getMediaType(row) {
  const raw = parseRaw(row?.raw)

  return (
    cleanText(row?.media_type) ||
    cleanText(row?.attachment_type) ||
    cleanText(row?.message_type) ||
    cleanText(row?.type) ||
    cleanText(raw?.type) ||
    ''
  )
}

function getFilename(row) {
  const raw = parseRaw(row?.raw)

  return (
    cleanText(row?.filename) ||
    cleanText(row?.file_name) ||
    cleanText(row?.attachment_filename) ||
    cleanText(row?.media_filename) ||
    cleanText(raw?.filename) ||
    cleanText(raw?.attachment_filename) ||
    ''
  )
}

function getMetaMessageId(row) {
  return (
    cleanText(row?.meta_message_id) ||
    cleanText(row?.whatsapp_message_id) ||
    cleanText(row?.message_id) ||
    cleanText(row?.wamid) ||
    ''
  )
}

// NOTIVA_PATCH_04_SAFE_INCOMING_MEDIA_FIELDS_V1
function getContactData(row) {
  const type = getMediaType(row).toLowerCase()

  if (type !== 'contacts' && type !== 'contact') return []

  const value = cleanText(row?.media_caption)
  if (!value) return []

  try {
    const parsed = JSON.parse(value)

    if (Array.isArray(parsed)) return parsed
    if (Array.isArray(parsed?.contacts)) return parsed.contacts

    return []
  } catch (error) {
    return []
  }
}

async function safeQuery(label, queryBuilder) {
  try {
    const result = await queryBuilder()

    if (result.error) {
      console.error(label, result.error.message)
      return []
    }

    return Array.isArray(result.data) ? result.data : []
  } catch (error) {
    console.error(label, error.message)
    return []
  }
}

async function queryByPhone(table, variants, max = 500) {
  if (!variants.length) return []

  const rows = await safeQuery(table, () =>
    supabaseAdmin
      .from(table)
      .select('*')
      .in('phone', variants)
      .limit(max)
  )

  return rows
}

async function fetchFocusItem(focusItemId) {
  if (!focusItemId) return null

  const result = await supabaseAdmin
    .from('send_job_items')
    .select('*')
    .eq('id', focusItemId)
    .maybeSingle()

  if (result.error) return null

  return result.data || null
}

function buildIncomingMessage(row) {
  const createdAt = getIncomingTime(row)
  const body = getBody(row)
  const mediaType = getMediaType(row)
  const filename = getFilename(row)
  const contactData = getContactData(row)

  return {
    id: row.id ? 'incoming-' + row.id : 'incoming-' + createdAt,
    source_id: row.id || null,
    direction: 'incoming',
    type: mediaType || (getMediaUrl(row) ? 'image' : 'text'),
    message_type: mediaType || 'text',
    message: body || filename || '[Incoming message]',
    body: body || filename || '[Incoming message]',
    text: body || filename || '[Incoming message]',
    created_at: createdAt,
    timestamp: createdAt,
    phone: getIncomingPhone(row),
    media_id: cleanText(row?.media_id) || null,
    media_mime_type: cleanText(row?.media_mime_type) || null,
    media_filename: cleanText(row?.media_filename) || filename || null,
    media_caption: cleanText(row?.media_caption) || null,
    contact_data: contactData,
    media_url: getMediaUrl(row) || null,
    attachment_url: getMediaUrl(row) || null,
    attachment_type: mediaType || null,
    attachment_filename: filename || null,
    filename: filename || null,
    raw: row
  }
}

function buildOutgoingMessage(row) {
  const createdAt = getOutgoingTime(row)
  const mediaUrl = getMediaUrl(row)
  const mediaType = getMediaType(row)
  const body = getBody(row)

  return {
    id: row.id ? 'outgoing-' + row.id : 'outgoing-' + createdAt,
    source_id: row.id || null,
    direction: 'outgoing',
    type: mediaType || (mediaUrl ? 'image' : 'text'),
    message: body || getFilename(row) || '[Outgoing message]',
    body: body || getFilename(row) || '[Outgoing message]',
    text: body || getFilename(row) || '[Outgoing message]',
    created_at: createdAt,
    timestamp: createdAt,
    phone: getOutgoingPhone(row),
    media_url: mediaUrl || null,
    attachment_url: mediaUrl || null,
    attachment_type: mediaType || null,
    attachment_filename: getFilename(row) || null,
    filename: getFilename(row) || null,
    status: row.status || '',
    meta_message_id: getMetaMessageId(row) || null,
    raw: row
  }
}

function buildJobItemMessage(row) {
  const createdAt = getJobItemTime(row)
  const mediaUrl = getMediaUrl(row)
  const mediaType = getMediaType(row) || cleanText(row.template_header_type).toLowerCase()
  const body = getBody(row)

  return {
    id: row.id ? 'job-item-' + row.id : 'job-item-' + createdAt,
    source_id: row.id || null,
    job_id: row.job_id || null,
    job_item_id: row.id || null,
    direction: 'outgoing',
    type: mediaType || (mediaUrl ? 'image' : 'template'),
    message: body || (row.template_name ? 'Template Blast: ' + row.template_name : '[Template Blast]'),
    body: body || (row.template_name ? 'Template Blast: ' + row.template_name : '[Template Blast]'),
    text: body || (row.template_name ? 'Template Blast: ' + row.template_name : '[Template Blast]'),
    created_at: createdAt,
    timestamp: createdAt,
    phone: cleanPhone(row.phone),
    media_url: mediaUrl || null,
    attachment_url: mediaUrl || null,
    attachment_type: mediaType || null,
    attachment_filename: getFilename(row) || null,
    filename: getFilename(row) || null,
    status: row.status || '',
    template_name: row.template_name || '',
    template_language: row.template_language || '',
    template_header_type: row.template_header_type || '',
    header_media_id: row.header_media_id || null,
    meta_message_id: getMetaMessageId(row) || null,
    is_blast_history: true,
    raw: row
  }
}

function dedupeMessages(messages) {
  const map = new Map()

  for (const message of messages || []) {
    const metaId = cleanText(message.meta_message_id)

    const key = metaId
      ? 'meta::' + metaId
      : message.id || [message.direction, message.phone, message.created_at, message.message].join('::')

    map.set(key, message)
  }

  return Array.from(map.values())
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    const authUser = await requireRole(req, res, ['master', 'admin', 'user', 'agent'])
    if (!authUser) return

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const requestedPhone = cleanPhone(req.query.phone || req.query.wa_id || '')
    const before = cleanText(req.query.before)
    const beforeTime = before ? getTime(before) : 0
    const limit = toLimit(req.query.limit)
    const focusItemId = cleanText(req.query.job_item_id || req.query.item_id)

    const focusItem = await fetchFocusItem(focusItemId)
    const targetPhone = requestedPhone || cleanPhone(focusItem?.phone)

    if (!targetPhone) {
      return res.status(400).json({
        success: false,
        message: 'phone wajib diisi.'
      })
    }

    const variants = phoneVariants(targetPhone)

    const [incomingRows, outgoingRows, jobItemRows] = await Promise.all([
      queryByPhone('wa_incoming_messages', variants, 700),
      queryByPhone('wa_outgoing_messages', variants, 700),
      queryByPhone('send_job_items', variants, 700)
    ])

    let relevantJobItems = (jobItemRows || []).filter((item) => {
      return cleanPhone(item.phone) === targetPhone
    })

    if (focusItem && !relevantJobItems.some((item) => cleanText(item.id) === focusItemId)) {
      relevantJobItems.push(focusItem)
    }

    const incoming = (incomingRows || [])
      .filter((row) => getIncomingPhone(row) === targetPhone)
      .map(buildIncomingMessage)

    const outgoing = (outgoingRows || [])
      .filter((row) => getOutgoingPhone(row) === targetPhone)
      .map(buildOutgoingMessage)

    const blastOutgoing = relevantJobItems.map(buildJobItemMessage)

    const allMessages = dedupeMessages([
      ...incoming,
      ...outgoing,
      ...blastOutgoing
    ])
      .filter((item) => item.created_at)
      .sort((a, b) => getTime(a.created_at) - getTime(b.created_at))

    const filteredByCursor = beforeTime
      ? allMessages.filter((item) => getTime(item.created_at) < beforeTime)
      : allMessages

    let pageMessages = filteredByCursor.slice(-limit)
    let hasMore = filteredByCursor.length > limit

    if (focusItemId && !beforeTime) {
      const focusIndex = allMessages.findIndex((item) => {
        return (
          cleanText(item.job_item_id) === focusItemId ||
          cleanText(item.id) === 'job-item-' + focusItemId
        )
      })

      if (focusIndex >= 0) {
        const start = Math.max(0, focusIndex - 20)
        const end = Math.min(allMessages.length, focusIndex + 31)

        pageMessages = allMessages.slice(start, end)
        hasMore = start > 0
      }
    }

    const oldestCursor = pageMessages[0]?.created_at || null

    return res.status(200).json({
      success: true,
      phone: targetPhone,
      messages: pageMessages,
      data: pageMessages,
      rows: pageMessages,
      has_more: hasMore,
      hasMore,
      oldest_cursor: oldestCursor,
      oldestCursor,
      total: allMessages.length,
      debug: {
        optimized_query: true,
        incoming_total: incoming.length,
        outgoing_total: outgoing.length,
        blast_history_total: blastOutgoing.length,
        focus_item_id: focusItemId || null,
        focus_item_found: Boolean(focusItem)
      }
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memuat messages.'
    })
  }
}