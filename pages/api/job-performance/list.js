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

function getJobId(row) {
  return cleanText(row?.id || row?.job_id || row?.send_job_id || '')
}

function getItemJobId(row) {
  return cleanText(row?.job_id || row?.send_job_id || row?.jobId || '')
}

function getItemPhone(row) {
  return cleanPhone(row?.phone || row?.wa_id || row?.customer_phone || row?.recipient_phone || '')
}

function getIncomingPhone(row) {
  return cleanPhone(row?.phone || row?.from || row?.wa_id || row?.sender_phone || row?.customer_phone || '')
}

function getOutgoingPhone(row) {
  return cleanPhone(row?.phone || row?.to || row?.wa_id || row?.customer_phone || row?.recipient_phone || '')
}

function getIncomingTime(row) {
  return (
    row?.received_at ||
    row?.message_created_at ||
    row?.created_at ||
    row?.updated_at ||
    ''
  )
}

function getOutgoingTime(row) {
  return (
    row?.sent_at ||
    row?.created_at ||
    row?.updated_at ||
    ''
  )
}

function getItemTime(row) {
  return (
    row?.sent_at ||
    row?.processed_at ||
    row?.updated_at ||
    row?.created_at ||
    row?.scheduled_at ||
    ''
  )
}

function getJobTime(row) {
  return (
    row?.created_at ||
    row?.scheduled_at ||
    row?.updated_at ||
    ''
  )
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

function buildScore({ sent, interestedOnly, followUp, notInterested, optOut, hotLead }) {
  const base = Math.max(1, toNumber(sent, 0))
  const point =
    toNumber(hotLead) * 8 +
    toNumber(interestedOnly) * 5 +
    toNumber(followUp) * 2 -
    toNumber(notInterested) * 3 -
    toNumber(optOut) * 5

  const maxPoint = base * 8
  const score = Math.round((Math.max(0, point) / maxPoint) * 100)

  return Math.min(100, Math.max(0, score))
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

function groupItemsByJob(items) {
  const map = new Map()

  for (const item of items || []) {
    const jobId = getItemJobId(item)
    if (!jobId) continue

    if (!map.has(jobId)) map.set(jobId, [])

    map.get(jobId).push(item)
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

function hasOutgoingAfter({ phone, startAt, outgoingByPhone }) {
  return Boolean(getFirstOutgoingAfter({ phone, startAt, outgoingByPhone }))
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

function getDatabaseName(job, databaseMap) {
  const databaseId = cleanText(job?.database_id || job?.databaseId || '')
  const database = databaseMap.get(databaseId)

  return (
    cleanText(database?.name) ||
    cleanText(database?.title) ||
    cleanText(job?.database_name) ||
    cleanText(job?.database) ||
    '-'
  )
}

function getJobTitle(job) {
  return (
    cleanText(job?.name) ||
    cleanText(job?.title) ||
    cleanText(job?.job_name) ||
    cleanText(job?.template_name) ||
    `Job ${getJobId(job)}`
  )
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

function buildPerformanceForJob({ job, items, incomingByPhone, outgoingByPhone, databaseMap, paidRate }) {
  const jobId = getJobId(job)
  const safeItems = Array.isArray(items) ? items : []

  const target = Math.max(
    safeItems.length,
    toNumber(job?.total_items, 0),
    toNumber(job?.target, 0),
    toNumber(job?.target_count, 0),
    toNumber(job?.total_count, 0),
    toNumber(job?.contacts_count, 0)
  )

  let sent = 0
  let failed = 0
  let replies = 0
  let needResponse = 0
  let interestedOnly = 0
  let followUp = 0
  let notInterested = 0
  let optOut = 0
  let hotLead = 0
  let neutral = 0

  const responseSeconds = []

  for (const item of safeItems) {
    const phone = getItemPhone(item)
    if (!phone) continue

    const itemStartAt = getItemTime(item) || getJobTime(job)
    const itemFailed = isItemFailed(item)
    const itemSent = isItemSent({
      item,
      job,
      outgoingByPhone
    })

    if (itemFailed) failed += 1
    if (itemSent) sent += 1

    const firstReply = getFirstIncomingAfter({
      phone,
      startAt: itemStartAt,
      incomingByPhone
    })

    if (!firstReply) continue

    replies += 1

    const firstReplyAt = getIncomingTime(firstReply)
    const firstAgentReply = getFirstAgentReplyAfterCustomer({
      phone,
      firstReplyAt,
      outgoingByPhone
    })

    if (!firstAgentReply) {
      needResponse += 1
    } else {
      const seconds = Math.round((getTime(getOutgoingTime(firstAgentReply)) - getTime(firstReplyAt)) / 1000)
      if (seconds > 0) responseSeconds.push(seconds)
    }

    const bucket = classifyReply(getReplyBody(firstReply))

    if (bucket === 'hot_lead') hotLead += 1
    else if (bucket === 'interested') interestedOnly += 1
    else if (bucket === 'follow_up') followUp += 1
    else if (bucket === 'not_interested') notInterested += 1
    else if (bucket === 'opt_out') optOut += 1
    else neutral += 1
  }

  const fallbackSent = Math.max(
    sent,
    toNumber(job?.sent, 0),
    toNumber(job?.sent_count, 0),
    toNumber(job?.sent_items, 0)
  )

  const finalSent = fallbackSent
  const responseBase = Math.max(finalSent, target)
  const noResponse = Math.max(0, responseBase - replies)
  const interested = interestedOnly + hotLead

  const replyRate = responseBase > 0 ? Math.round((replies / responseBase) * 100) : 0
  const interestRate = responseBase > 0 ? Math.round((interested / responseBase) * 100) : 0
  const notInterestedRate = responseBase > 0 ? Math.round((notInterested / responseBase) * 100) : 0

  const avgResponseSeconds =
    responseSeconds.length > 0
      ? Math.round(responseSeconds.reduce((acc, item) => acc + item, 0) / responseSeconds.length)
      : 0

  const billableMessages = finalSent > 0 ? finalSent : isJobDone(job) ? target : 0
  const costEstimate = Math.round(billableMessages * paidRate)

  const score = buildScore({
    sent: responseBase,
    interestedOnly,
    followUp,
    notInterested,
    optOut,
    hotLead
  })

  const createdAt = job?.created_at || job?.scheduled_at || job?.updated_at || null

  return {
    id: jobId,
    job_id: jobId,
    name: getJobTitle(job),
    title: getJobTitle(job),
    type: job?.type || 'blast',
    send_mode: job?.send_mode || job?.mode || '',
    status: job?.status || '-',
    database_id: job?.database_id || null,
    database_name: getDatabaseName(job, databaseMap),
    database: getDatabaseName(job, databaseMap),
    created_at: createdAt,
    updated_at: job?.updated_at || createdAt,

    target,
    target_count: target,
    total_items: target,

    sent: finalSent,
    sent_count: finalSent,

    failed,
    failed_count: failed,

    replies,
    reply_count: replies,
    responses: replies,

    no_response: noResponse,
    no_response_count: noResponse,

    need_response: needResponse,
    need_response_count: needResponse,

    interested,
    interested_count: interested,
    interested_only: interestedOnly,

    follow_up: followUp,
    follow_up_count: followUp,

    not_interested: notInterested,
    not_interested_count: notInterested,

    opt_out: optOut,
    opt_out_count: optOut,

    hot_lead: hotLead,
    hot_lead_count: hotLead,

    neutral,
    neutral_count: neutral,

    reply_rate: replyRate,
    interest_rate: interestRate,
    not_interested_rate: notInterestedRate,

    avg_response_seconds: avgResponseSeconds,
    avg_response_time: secondsToLabel(avgResponseSeconds),
    avg_response: secondsToLabel(avgResponseSeconds),

    score,
    avg_score: score,

    cost_estimate: costEstimate,
    cost_estimate_idr: costEstimate,
    estimated_cost: costEstimate,

    debug: {
      items_loaded: safeItems.length,
      job_total_items: job?.total_items || null,
      repaired_target_fallback: true
    }
  }
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

    const paidRate = toNumber(process.env.WA_ESTIMATED_PAID_MESSAGE_COST_IDR, 0)

    const jobs = await fetchAll('send_jobs', 1000)
    const jobMap = new Map(jobs.map((job) => [getJobId(job), job]))

    const allItems = await safeFetchAll('send_job_items', 50000)
    const items = allItems.filter((item) => jobMap.has(getItemJobId(item)))
    const itemsByJob = groupItemsByJob(items)

    const incomingRows = await safeFetchAll('wa_incoming_messages', 50000)
    const outgoingRows = await safeFetchAll('wa_outgoing_messages', 50000)
    const databases = await safeFetchAll('contact_databases', 5000)

    const databaseMap = new Map(
      databases.map((database) => [cleanText(database.id), database])
    )

    const incomingByPhone = groupByPhone(incomingRows, getIncomingPhone, getIncomingTime)
    const outgoingByPhone = groupByPhone(outgoingRows, getOutgoingPhone, getOutgoingTime)

    const rows = jobs
      .map((job) => {
        const jobId = getJobId(job)

        return buildPerformanceForJob({
          job,
          items: itemsByJob.get(jobId) || [],
          incomingByPhone,
          outgoingByPhone,
          databaseMap,
          paidRate
        })
      })
      .sort((a, b) => getTime(b.created_at) - getTime(a.created_at))

    const summary = rows.reduce(
      (acc, item) => {
        acc.jobs += 1
        acc.target += toNumber(item.target)
        acc.sent += toNumber(item.sent)
        acc.failed += toNumber(item.failed)
        acc.replies += toNumber(item.replies)
        acc.no_response += toNumber(item.no_response)
        acc.need_response += toNumber(item.need_response)
        acc.interested += toNumber(item.interested)
        acc.follow_up += toNumber(item.follow_up)
        acc.not_interested += toNumber(item.not_interested)
        acc.opt_out += toNumber(item.opt_out)
        acc.hot_lead += toNumber(item.hot_lead)
        acc.cost_estimate += toNumber(item.cost_estimate)
        acc.score_total += toNumber(item.score)
        return acc
      },
      {
        jobs: 0,
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
        hot_lead: 0,
        cost_estimate: 0,
        score_total: 0
      }
    )

    summary.reply_rate = summary.target > 0 ? Math.round((summary.replies / summary.target) * 100) : 0
    summary.interest_rate = summary.target > 0 ? Math.round((summary.interested / summary.target) * 100) : 0
    summary.avg_score = summary.jobs > 0 ? Math.round(summary.score_total / summary.jobs) : 0
    delete summary.score_total

    return res.status(200).json({
      success: true,
      rows,
      items: rows,
      jobs: rows,
      data: rows,
      summary,
      debug: {
        jobs_loaded: jobs.length,
        job_items_loaded: items.length,
        incoming_loaded: incomingRows.length,
        outgoing_loaded: outgoingRows.length,
        target_fallback_enabled: true
      }
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memuat job performance.'
    })
  }
}