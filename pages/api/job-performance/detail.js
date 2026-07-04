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

function toNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function getTime(value) {
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

function secondsToLabel(seconds) {
  const value = toNumber(seconds, 0)

  if (!value || value <= 0) return '-'
  if (value < 60) return `${Math.round(value)} detik`

  const minutes = Math.round(value / 60)

  if (minutes < 60) return `${minutes} menit`

  const hours = Math.round(minutes / 60)

  if (hours < 24) return `${hours} jam`

  const days = Math.round(hours / 24)

  return `${days} hari`
}

function getReplyBody(row) {
  return (
    cleanText(row?.body) ||
    cleanText(row?.message) ||
    cleanText(row?.text) ||
    cleanText(row?.content) ||
    cleanText(row?.media_caption) ||
    cleanText(row?.caption) ||
    ''
  )
}

function getIncomingPhone(row) {
  return cleanPhone(row?.phone || row?.from || row?.wa_id || row?.sender_phone || row?.customer_phone || '')
}

function getOutgoingPhone(row) {
  return cleanPhone(row?.phone || row?.to || row?.wa_id || row?.customer_phone || row?.recipient_phone || '')
}

function getItemPhone(row) {
  return cleanPhone(row?.phone || row?.wa_id || row?.customer_phone || row?.recipient_phone || '')
}

function getIncomingTime(row) {
  return row?.received_at || row?.message_created_at || row?.created_at || row?.updated_at || ''
}

function getOutgoingTime(row) {
  return row?.sent_at || row?.created_at || row?.updated_at || ''
}

function getItemTime(row) {
  return row?.sent_at || row?.processed_at || row?.updated_at || row?.created_at || row?.scheduled_at || ''
}

function getJobTime(row) {
  return row?.created_at || row?.scheduled_at || row?.updated_at || ''
}

function normalizeStatus(value) {
  return cleanText(value).toLowerCase()
}

function isJobDone(job) {
  const status = normalizeStatus(job?.status)

  return (
    status === 'done' ||
    status === 'completed' ||
    status === 'complete' ||
    status === 'finished' ||
    status === 'success'
  )
}

function isSentStatus(value) {
  const status = normalizeStatus(value)

  return (
    status === 'sent' ||
    status === 'success' ||
    status === 'delivered' ||
    status === 'read' ||
    status === 'done' ||
    status === 'completed' ||
    status === 'complete'
  )
}

function isFailedStatus(value) {
  const status = normalizeStatus(value)

  return (
    status === 'failed' ||
    status === 'error' ||
    status === 'undelivered' ||
    status === 'rejected'
  )
}

function classifyReply(text) {
  const value = cleanText(text).toLowerCase()

  if (!value) return 'neutral'

  const optOutWords = [
    'stop',
    'unsubscribe',
    'jangan kirim',
    'jangan chat',
    'jangan wa',
    'hapus nomor',
    'remove'
  ]

  const notInterestedWords = [
    'tidak berminat',
    'tidak minat',
    'tdk minat',
    'ga minat',
    'gak minat',
    'ngga minat',
    'nggak minat',
    'tidak tertarik',
    'belum minat',
    'tidak jadi',
    'ga jadi',
    'gak jadi',
    'batal',
    'cancel',
    'not interested'
  ]

  const hotLeadWords = [
    'mau daftar',
    'ingin daftar',
    'boleh daftar',
    'daftarkan',
    'booking',
    'book',
    'register',
    'registrasi',
    'bayar',
    'payment',
    'transfer',
    'invoice',
    'link pembayaran'
  ]

  const interestedWords = [
    'berminat',
    'minat',
    'tertarik',
    'mau ikut',
    'ikut',
    'mau',
    'boleh',
    'lanjut',
    'yes',
    'ya',
    'iya',
    'ok',
    'oke'
  ]

  const followUpWords = [
    'harga',
    'biaya',
    'berapa',
    'info',
    'detail',
    'jadwal',
    'schedule',
    'nanti',
    'lihat dulu',
    'liat dulu',
    'tanya',
    'apa ada',
    'apakah ada',
    'kapan',
    'dimana',
    'di mana',
    'online',
    'offline',
    '?'
  ]

  if (optOutWords.some((word) => value.includes(word))) return 'opt_out'
  if (notInterestedWords.some((word) => value.includes(word))) return 'not_interested'
  if (hotLeadWords.some((word) => value.includes(word))) return 'hot_lead'
  if (interestedWords.some((word) => value.includes(word))) return 'interested'
  if (followUpWords.some((word) => value.includes(word))) return 'follow_up'

  return 'neutral'
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

function groupByPhone(rows, phoneGetter, timeGetter) {
  const map = new Map()

  for (const row of rows || []) {
    const phone = phoneGetter(row)
    if (!phone) continue

    if (!map.has(phone)) map.set(phone, [])

    map.get(phone).push(row)
  }

  for (const list of map.values()) {
    list.sort((a, b) => getTime(timeGetter(a)) - getTime(timeGetter(b)))
  }

  return map
}

function getFirstIncomingAfter({ phone, startAt, incomingByPhone }) {
  const startTime = getTime(startAt)
  const list = incomingByPhone.get(phone) || []

  for (const item of list) {
    if (getTime(getIncomingTime(item)) >= startTime) return item
  }

  return null
}

function getFirstOutgoingAfter({ phone, startAt, outgoingByPhone }) {
  const startTime = getTime(startAt)
  const list = outgoingByPhone.get(phone) || []

  for (const item of list) {
    if (getTime(getOutgoingTime(item)) >= startTime) return item
  }

  return null
}

function getFirstAgentReplyAfterCustomer({ phone, firstReplyAt, outgoingByPhone }) {
  if (!firstReplyAt) return null

  const startTime = getTime(firstReplyAt)
  const list = outgoingByPhone.get(phone) || []

  for (const item of list) {
    if (getTime(getOutgoingTime(item)) > startTime) return item
  }

  return null
}

function hasOutgoingAfter({ phone, startAt, outgoingByPhone }) {
  return Boolean(getFirstOutgoingAfter({ phone, startAt, outgoingByPhone }))
}

function isItemFailed(item) {
  return isFailedStatus(item?.status)
}

function isItemSent({ item, job, outgoingByPhone }) {
  const phone = getItemPhone(item)
  const startAt = getItemTime(item) || getJobTime(job)

  if (isItemFailed(item)) return false
  if (isSentStatus(item?.status)) return true
  if (cleanText(item?.sent_at)) return true
  if (cleanText(item?.delivered_at)) return true
  if (cleanText(item?.read_at)) return true
  if (hasOutgoingAfter({ phone, startAt, outgoingByPhone })) return true
  if (isJobDone(job)) return true

  return false
}

function getContactName(phone, contactsByPhone, item) {
  const contact = contactsByPhone.get(phone)

  return (
    cleanText(item?.name) ||
    cleanText(item?.profile_name) ||
    cleanText(item?.contact_name) ||
    cleanText(contact?.name) ||
    cleanText(contact?.profile_name) ||
    '-'
  )
}

function shouldIncludeDetail(detail, selected) {
  const filter = cleanText(selected).toLowerCase()

  if (!filter || filter === 'all' || filter === 'semua') return true
  if (filter === 'target') return true
  if (filter === 'sent') return detail.sent
  if (filter === 'failed') return detail.failed
  if (filter === 'replies' || filter === 'reply') return detail.hasReply
  if (filter === 'no_response') return !detail.hasReply
  if (filter === 'need_response') return detail.hasReply && !detail.hasAgentReply
  if (filter === 'interested') return detail.replyBucket === 'interested' || detail.replyBucket === 'hot_lead'
  if (filter === 'follow_up' || filter === 'follow-up') return detail.replyBucket === 'follow_up'
  if (filter === 'not_interested' || filter === 'not-int') return detail.replyBucket === 'not_interested'
  if (filter === 'opt_out' || filter === 'opt-out') return detail.replyBucket === 'opt_out'
  if (filter === 'hot_lead' || filter === 'hot-lead') return detail.replyBucket === 'hot_lead'
  if (filter === 'score') return true

  return true
}

function buildDetailRows({ job, items, incomingByPhone, outgoingByPhone, contactsByPhone }) {
  const rows = []

  for (const item of items || []) {
    const phone = getItemPhone(item)
    if (!phone) continue

    const startAt = getItemTime(item) || getJobTime(job)
    const firstReply = getFirstIncomingAfter({
      phone,
      startAt,
      incomingByPhone
    })

    const firstReplyAt = firstReply ? getIncomingTime(firstReply) : null

    const firstAgentReply = firstReply
      ? getFirstAgentReplyAfterCustomer({
          phone,
          firstReplyAt,
          outgoingByPhone
        })
      : null

    const agentReplyAt = firstAgentReply ? getOutgoingTime(firstAgentReply) : null
    const responseSeconds =
      firstReplyAt && agentReplyAt
        ? Math.max(0, Math.round((getTime(agentReplyAt) - getTime(firstReplyAt)) / 1000))
        : 0

    const replyText = getReplyBody(firstReply)
    const replyBucket = classifyReply(replyText)
    const failed = isItemFailed(item)
    const sent = isItemSent({ item, job, outgoingByPhone })

    rows.push({
      id: item.id || `${job.id}-${phone}`,
      item_id: item.id || null,
      job_id: job.id,
      phone,
      name: getContactName(phone, contactsByPhone, item),
      profile_name: getContactName(phone, contactsByPhone, item),

      status: item.status || '-',
      sent,
      failed,
      pending: !sent && !failed,

      message: item.message || '',
      template_name: item.template_name || null,
      template_language: item.template_language || null,

      processedAt: item.processed_at || item.updated_at || item.created_at || null,
      sentAt: item.sent_at || item.processed_at || item.updated_at || item.created_at || null,
      scheduledAt: item.scheduled_at || null,

      hasReply: Boolean(firstReply),
      hasAgentReply: Boolean(firstAgentReply),
      replyCount: firstReply ? 1 : 0,
      replyBucket,
      lastReply: replyText,
      lastReplyAt: firstReplyAt,
      agentReply: getReplyBody(firstAgentReply),
      agentReplyAt,
      responseSeconds,
      responseTime: secondsToLabel(responseSeconds),

      errorMessage: item.error_message || item.error || null,
      error_message: item.error_message || item.error || null
    })
  }

  return rows.sort((a, b) => {
    const bTime = getTime(b.lastReplyAt || b.sentAt || b.processedAt)
    const aTime = getTime(a.lastReplyAt || a.sentAt || a.processedAt)
    return bTime - aTime
  })
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

    const jobId = cleanText(req.query.job_id || req.query.id || '')
    const selected = cleanText(req.query.bucket || req.query.metric || req.query.type || 'all')

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
      .single()

    if (jobResult.error || !jobResult.data) {
      return res.status(404).json({
        success: false,
        message: jobResult.error?.message || 'Job tidak ditemukan.'
      })
    }

    const job = jobResult.data

    const itemsResult = await supabaseAdmin
      .from('send_job_items')
      .select('*')
      .eq('job_id', jobId)
      .limit(50000)

    if (itemsResult.error) {
      return res.status(500).json({
        success: false,
        message: itemsResult.error.message
      })
    }

    const items = Array.isArray(itemsResult.data) ? itemsResult.data : []

    const incomingRows = await safeFetchAll('wa_incoming_messages', 50000)
    const outgoingRows = await safeFetchAll('wa_outgoing_messages', 50000)

    let contacts = []

    if (job.database_id) {
      const contactsResult = await supabaseAdmin
        .from('contacts')
        .select('*')
        .eq('database_id', job.database_id)
        .limit(50000)

      if (!contactsResult.error) {
        contacts = contactsResult.data || []
      }
    }

    const contactsByPhone = new Map()

    for (const contact of contacts || []) {
      const phone = cleanPhone(contact.phone)
      if (phone) contactsByPhone.set(phone, contact)
    }

    const incomingByPhone = groupByPhone(incomingRows, getIncomingPhone, getIncomingTime)
    const outgoingByPhone = groupByPhone(outgoingRows, getOutgoingPhone, getOutgoingTime)

    const allDetails = buildDetailRows({
      job,
      items,
      incomingByPhone,
      outgoingByPhone,
      contactsByPhone
    })

    const filteredDetails = allDetails.filter((detail) => shouldIncludeDetail(detail, selected))

    const summary = allDetails.reduce(
      (acc, item) => {
        acc.target += 1
        if (item.sent) acc.sent += 1
        if (item.failed) acc.failed += 1
        if (item.hasReply) acc.replies += 1
        if (!item.hasReply) acc.no_response += 1
        if (item.hasReply && !item.hasAgentReply) acc.need_response += 1
        if (item.replyBucket === 'interested' || item.replyBucket === 'hot_lead') acc.interested += 1
        if (item.replyBucket === 'follow_up') acc.follow_up += 1
        if (item.replyBucket === 'not_interested') acc.not_interested += 1
        if (item.replyBucket === 'opt_out') acc.opt_out += 1
        if (item.replyBucket === 'hot_lead') acc.hot_lead += 1
        return acc
      },
      {
        target: 0,
        sent: 0,
        failed: 0,
        replies: 0,
        no_response: 0,
        need_response: 0,
        interested: 0,
        follow_up: 0,
        not_interested: 0,
        opt_out: 0,
        hot_lead: 0
      }
    )

    summary.target = Math.max(
      summary.target,
      toNumber(job.total_items, 0),
      toNumber(job.target, 0),
      toNumber(job.target_count, 0)
    )

    return res.status(200).json({
      success: true,
      job,
      rows: filteredDetails,
      items: filteredDetails,
      details: filteredDetails,
      data: filteredDetails,
      summary,
      debug: {
        job_id: jobId,
        selected,
        job_total_items: job.total_items || null,
        items_loaded: items.length,
        detail_rows: filteredDetails.length,
        target_fallback_enabled: true
      }
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memuat detail job performance.'
    })
  }
}