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

function getItemTime(row) {
  return (
    row?.processed_at ||
    row?.scheduled_at ||
    row?.created_at ||
    row?.updated_at ||
    ''
  )
}

function getIncomingTime(row) {
  return row?.received_at || row?.message_created_at || row?.created_at || row?.updated_at || ''
}

function getOutgoingTime(row) {
  return row?.sent_at || row?.created_at || row?.updated_at || row?.processed_at || ''
}

function getLogTime(row) {
  return (
    row?.sent_at ||
    row?.processed_at ||
    row?.created_at ||
    row?.updated_at ||
    row?.scheduled_at ||
    row?.timestamp ||
    ''
  )
}

function getPhone(row) {
  return cleanPhone(row?.phone || row?.to || row?.from || row?.wa_id || row?.customer_phone || row?.recipient_phone || '')
}

function getJobId(row) {
  return cleanText(row?.job_id || row?.send_job_id || row?.jobId || '')
}

function getMessageId(row) {
  return cleanText(
    row?.meta_message_id ||
    row?.whatsapp_message_id ||
    row?.message_id ||
    row?.wamid ||
    row?.id_message ||
    ''
  )
}

function getBody(row) {
  return (
    cleanText(row?.message) ||
    cleanText(row?.body) ||
    cleanText(row?.text) ||
    cleanText(row?.content) ||
    cleanText(row?.caption) ||
    ''
  )
}

function normalizeDeliveryStatus(value) {
  const status = cleanText(value).toLowerCase()

  if (status === 'read') return 'read'
  if (status === 'delivered') return 'delivered'
  if (status === 'sent' || status === 'success') return 'sent'
  if (status === 'failed' || status === 'error') return 'failed'
  if (status === 'pending' || status === 'queued') return 'pending'

  return status || 'unknown'
}

function statusRank(status) {
  const normalized = normalizeDeliveryStatus(status)

  if (normalized === 'read') return 5
  if (normalized === 'delivered') return 4
  if (normalized === 'sent') return 3
  if (normalized === 'pending') return 2
  if (normalized === 'failed') return 1

  return 0
}

function bestStatus(statuses) {
  let best = 'unknown'
  let bestRank = 0

  for (const status of statuses || []) {
    const normalized = normalizeDeliveryStatus(status)
    const rank = statusRank(normalized)

    if (rank > bestRank) {
      best = normalized
      bestRank = rank
    }
  }

  return best
}

function csvEscape(value) {
  const text = String(value ?? '').replace(/"/g, '""')
  return `"${text}"`
}

function toCsv(rows) {
  const headers = [
    'job_id',
    'job_name',
    'segment',
    'phone',
    'name',
    'template_name',
    'send_item_status',
    'delivery_status',
    'is_read',
    'has_reply',
    'reply_at',
    'reply_message',
    'item_time',
    'blast_message',
    'failed_reason'
  ]

  const lines = [headers.join(',')]

  for (const row of rows) {
    lines.push(headers.map((key) => csvEscape(row[key])).join(','))
  }

  return lines.join('\n')
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
      return []
    }

    const batch = Array.isArray(result.data) ? result.data : []
    rows = rows.concat(batch)

    if (batch.length < pageSize) break

    from += pageSize
  }

  return rows
}

function groupByPhone(rows, phoneGetter) {
  const map = new Map()

  for (const row of rows || []) {
    const phone = phoneGetter(row)
    if (!phone) continue

    if (!map.has(phone)) map.set(phone, [])
    map.get(phone).push(row)
  }

  return map
}

function findReplyAfter({ phone, itemTime, incomingByPhone }) {
  const startTime = getTime(itemTime)
  const threshold = startTime > 0 ? startTime - 10 * 60 * 1000 : 0

  const incoming = incomingByPhone.get(phone) || []

  const replies = incoming
    .filter((row) => getTime(getIncomingTime(row)) >= threshold)
    .sort((a, b) => getTime(getIncomingTime(a)) - getTime(getIncomingTime(b)))

  return replies[0] || null
}

function collectDeliveryStatus({ item, jobId, phone, itemTime, outgoingByPhone, logsByPhone }) {
  const itemMessageId = getMessageId(item)
  const itemStartTime = getTime(itemTime)
  const minTime = itemStartTime > 0 ? itemStartTime - 60 * 60 * 1000 : 0
  const maxTime = itemStartTime > 0 ? itemStartTime + 7 * 24 * 60 * 60 * 1000 : Date.now()

  const statuses = []

  if (item.status) statuses.push(item.status)

  const outgoing = outgoingByPhone.get(phone) || []
  const logs = logsByPhone.get(phone) || []

  for (const row of outgoing) {
    const rowTime = getTime(getOutgoingTime(row))
    const rowMessageId = getMessageId(row)

    const messageIdMatch = itemMessageId && rowMessageId && itemMessageId === rowMessageId
    const timeMatch = rowTime >= minTime && rowTime <= maxTime

    if (messageIdMatch || timeMatch) {
      if (row.status) statuses.push(row.status)
    }
  }

  for (const row of logs) {
    const rowTime = getTime(getLogTime(row))
    const rowMessageId = getMessageId(row)
    const rowJobId = getJobId(row)

    const messageIdMatch = itemMessageId && rowMessageId && itemMessageId === rowMessageId
    const jobMatch = rowJobId && rowJobId === jobId
    const timeMatch = rowTime >= minTime && rowTime <= maxTime

    if (messageIdMatch || jobMatch || timeMatch) {
      if (row.status) statuses.push(row.status)
    }
  }

  return bestStatus(statuses)
}

function matchesSegment(row, segment) {
  if (segment === 'all') return true
  if (segment === 'read') return row.is_read === 'yes'
  if (segment === 'unread') return row.is_read !== 'yes'
  if (segment === 'replied') return row.has_reply === 'yes'
  if (segment === 'no_reply_read') return row.is_read === 'yes' && row.has_reply !== 'yes'

  return true
}

export default async function handler(req, res) {
  try {
    const authUser = requireRole(req, res, ['master', 'admin', 'user', 'agent'])
    if (!authUser) return

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const jobId = cleanText(req.query.job_id || req.query.jobId)
    const segment = cleanText(req.query.segment || 'all').toLowerCase() || 'all'

    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: 'job_id wajib diisi.'
      })
    }

    const jobResult = await supabaseAdmin
      .from('send_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle()

    if (jobResult.error) {
      return res.status(500).json({
        success: false,
        message: jobResult.error.message
      })
    }

    const job = jobResult.data || {}
    const jobName = cleanText(job.name || job.title || jobId)

    const itemsResult = await supabaseAdmin
      .from('send_job_items')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true })
      .limit(20000)

    if (itemsResult.error) {
      return res.status(500).json({
        success: false,
        message: itemsResult.error.message
      })
    }

    const items = itemsResult.data || []

    const [incomingRows, outgoingRows, logRows] = await Promise.all([
      fetchAll('wa_incoming_messages', 50000),
      fetchAll('wa_outgoing_messages', 50000),
      fetchAll('send_delivery_logs', 50000)
    ])

    const incomingByPhone = groupByPhone(incomingRows, getPhone)
    const outgoingByPhone = groupByPhone(outgoingRows, getPhone)
    const logsByPhone = groupByPhone(logRows, getPhone)

    const rows = []

    for (const item of items) {
      const phone = cleanPhone(item.phone)
      if (!phone) continue

      const itemTime = getItemTime(item)
      const reply = findReplyAfter({
        phone,
        itemTime,
        incomingByPhone
      })

      const deliveryStatus = collectDeliveryStatus({
        item,
        jobId,
        phone,
        itemTime,
        outgoingByPhone,
        logsByPhone
      })

      const row = {
        job_id: jobId,
        job_name: jobName,
        segment,
        phone,
        name: cleanText(item.name || item.customer_name || item.profile_name || ''),
        template_name: cleanText(item.template_name || ''),
        send_item_status: normalizeDeliveryStatus(item.status),
        delivery_status: deliveryStatus,
        is_read: deliveryStatus === 'read' ? 'yes' : 'no',
        has_reply: reply ? 'yes' : 'no',
        reply_at: reply ? getIncomingTime(reply) : '',
        reply_message: reply ? getBody(reply) : '',
        item_time: itemTime,
        blast_message: getBody(item),
        failed_reason: cleanText(item.error_message || item.error || item.failed_reason || '')
      }

      if (matchesSegment(row, segment)) {
        rows.push(row)
      }
    }

    const csv = toCsv(rows)
    const safeJobName = jobName.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 80)
    const filename = `job-performance-${safeJobName}-${segment}.csv`

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    return res.status(200).send(csv)
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal export segment.'
    })
  }
}