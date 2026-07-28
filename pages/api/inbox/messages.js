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

function getTime(value) {
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

function toLimit(value) {
  const number = Number(value)

  if (!Number.isFinite(number) || number <= 0) return 80

  return Math.min(300, Math.max(20, Math.floor(number)))
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

function getDeliveryPhone(row) {
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
  return row?.sent_at || row?.processed_at || row?.scheduled_at || row?.created_at || row?.updated_at || ''
}

function getDeliveryTime(row) {
  return row?.sent_at || row?.processed_at || row?.created_at || row?.updated_at || row?.scheduled_at || row?.timestamp || ''
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

function getDeliveryMode(row) {
  return cleanText(row?.mode || row?.event || row?.type || row?.status_type || '').toLowerCase()
}

async function fetchAll(table, maxRows = 50000) {
  const pageSize = 1000
  let from = 0
  let rows = []

  while (from < maxRows) {
    const to = from + pageSize - 1

    const result = await supabaseAdmin
      .from(table)
      .select('*')
      .range(from, to)

    if (result.error) {
      throw new Error(result.error.message)
    }

    const batch = Array.isArray(result.data) ? result.data : []
    rows = rows.concat(batch)

    if (batch.length < pageSize) break

    from += pageSize
  }

  return rows
}

async function safeFetchAll(table, maxRows = 50000) {
  try {
    return await fetchAll(table, maxRows)
  } catch (error) {
    return []
  }
}

async function fetchFocusItem(focusItemId) {
  if (!focusItemId) return null

  const result = await supabaseAdmin
    .from('send_job_items')
    .select('*')
    .eq('id', focusItemId)
    .single()

  if (result.error) return null

  return result.data || null
}

function buildIncomingMessage(row) {
  const createdAt = getIncomingTime(row)

  return {
    id: row.id ? 'incoming-' + row.id : 'incoming-' + createdAt,
    source_id: row.id || null,
    direction: 'incoming',
    type: 'text',
    message: getBody(row) || '[Incoming message]',
    body: getBody(row) || '[Incoming message]',
    text: getBody(row) || '[Incoming message]',
    created_at: createdAt,
    timestamp: createdAt,
    phone: getIncomingPhone(row),
    raw: row
  }
}

function buildOutgoingMessage(row) {
  const createdAt = getOutgoingTime(row)
  const mediaUrl = getMediaUrl(row)
  const mediaType = getMediaType(row)

  return {
    id: row.id ? 'outgoing-' + row.id : 'outgoing-' + createdAt,
    source_id: row.id || null,
    direction: 'outgoing',
    type: mediaType || (mediaUrl ? 'image' : 'text'),
    message: getBody(row) || getFilename(row) || '[Outgoing message]',
    body: getBody(row) || getFilename(row) || '[Outgoing message]',
    text: getBody(row) || getFilename(row) || '[Outgoing message]',
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

  return {
    id: row.id ? 'job-item-' + row.id : 'job-item-' + createdAt,
    source_id: row.id || null,
    job_id: row.job_id || null,
    job_item_id: row.id || null,
    direction: 'outgoing',
    type: mediaType || (mediaUrl ? 'image' : 'template'),
    message: getBody(row) || (row.template_name ? 'Template Blast: ' + row.template_name : '[Template Blast]'),
    body: getBody(row) || (row.template_name ? 'Template Blast: ' + row.template_name : '[Template Blast]'),
    text: getBody(row) || (row.template_name ? 'Template Blast: ' + row.template_name : '[Template Blast]'),
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

function buildDeliveryMessage(row) {
  const createdAt = getDeliveryTime(row)
  const mediaUrl = getMediaUrl(row)
  const mediaType = getMediaType(row)
  const templateName = cleanText(row.template_name || row.template || row.templateName)
  const body = getBody(row)

  return {
    id: row.id ? 'delivery-' + row.id : 'delivery-' + createdAt,
    source_id: row.id || null,
    job_id: row.job_id || row.send_job_id || null,
    job_item_id: row.job_item_id || null,
    direction: 'outgoing',
    type: mediaType || (mediaUrl ? 'image' : 'template'),
    message: body || (templateName ? 'Template Blast: ' + templateName : '[Template Blast / Delivery Log]'),
    body: body || (templateName ? 'Template Blast: ' + templateName : '[Template Blast / Delivery Log]'),
    text: body || (templateName ? 'Template Blast: ' + templateName : '[Template Blast / Delivery Log]'),
    created_at: createdAt,
    timestamp: createdAt,
    phone: getDeliveryPhone(row),
    media_url: mediaUrl || null,
    attachment_url: mediaUrl || null,
    attachment_type: mediaType || null,
    attachment_filename: getFilename(row) || null,
    filename: getFilename(row) || null,
    status: row.status || '',
    template_name: templateName,
    meta_message_id: getMetaMessageId(row) || null,
    is_delivery_log: true,
    raw: row
  }
}

function shouldUseDeliveryRow(row) {
  const mode = getDeliveryMode(row)

  if (mode === 'webhook_status') return false
  if (mode === 'status') return false

  const phone = getDeliveryPhone(row)
  if (!phone) return false

  const createdAt = getDeliveryTime(row)
  if (!createdAt) return false

  const body = getBody(row)
  const templateName = cleanText(row.template_name || row.template || row.templateName)
  const mediaUrl = getMediaUrl(row)

  return Boolean(body || templateName || mediaUrl)
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

    const phone = cleanPhone(req.query.phone || req.query.wa_id || '')
    const before = cleanText(req.query.before)
    const beforeTime = before ? getTime(before) : 0
    const limit = toLimit(req.query.limit)
    const focusItemId = cleanText(req.query.job_item_id || req.query.item_id)

    if (!phone && !focusItemId) {
      return res.status(400).json({
        success: false,
        message: 'phone wajib diisi.'
      })
    }

    const [incomingRows, outgoingRows, jobItemRows, deliveryRows, focusItem] = await Promise.all([
      safeFetchAll('wa_incoming_messages', 50000),
      safeFetchAll('wa_outgoing_messages', 50000),
      safeFetchAll('send_job_items', 50000),
      safeFetchAll('send_delivery_logs', 50000),
      fetchFocusItem(focusItemId)
    ])

    const targetPhone = phone || cleanPhone(focusItem?.phone)

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

    const deliveryOutgoing = (deliveryRows || [])
      .filter((row) => getDeliveryPhone(row) === targetPhone)
      .filter(shouldUseDeliveryRow)
      .map(buildDeliveryMessage)

    let allMessages = dedupeMessages([
      ...incoming,
      ...outgoing,
      ...blastOutgoing,
      ...deliveryOutgoing
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
        incoming_total: incoming.length,
        outgoing_total: outgoing.length,
        blast_history_total: blastOutgoing.length,
        delivery_log_total: deliveryOutgoing.length,
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
