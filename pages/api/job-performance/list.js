import { requireRole } from '../../../lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

function cleanText(value) {
  return String(value || '').trim()
}

function cleanPhone(value) {
  let phone = String(value || '').replace(/\D/g, '')

  if (phone.startsWith('0')) {
    phone = '62' + phone.slice(1)
  }

  return phone
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function getTime(value) {
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

function normalizeStatus(status) {
  const text = cleanText(status).toLowerCase()

  if (text === 'success') return 'sent'
  if (text === 'done') return 'sent'
  if (text === 'completed') return 'sent'
  if (text === 'error') return 'failed'

  return text || 'pending'
}

function classifyReply(text) {
  const value = cleanText(text).toLowerCase()

  if (!value) return 'none'

  const optOutWords = [
    'stop',
    'unsubscribe',
    'unsub',
    'jangan kirim',
    'jangan wa',
    'hapus nomor',
    'remove',
    'block',
    'blokir'
  ]

  const notInterestedWords = [
    'tidak minat',
    'tdk minat',
    'ga minat',
    'gak minat',
    'ngga minat',
    'nggak minat',
    'belum minat',
    'tidak tertarik',
    'no',
    'not interested'
  ]

  const hotLeadWords = [
    'berminat',
    'minat',
    'minta penawaran',
    'buatkan penawaran',
    'proposal',
    'bisa ka',
    'bisa kak',
    'daftar',
    'mau daftar',
    'ikut'
  ]

  const interestedWords = [
    'interested',
    'mau',
    'boleh',
    'oke',
    'ok',
    'yes',
    'ya'
  ]

  const followUpWords = [
    'nanti',
    'follow up',
    'follow-up',
    'hubungi',
    'info',
    'minta info',
    'kirim detail',
    'jadwal',
    'berapa',
    'harga'
  ]

  if (optOutWords.some((word) => value.includes(word))) return 'opt_out'
  if (notInterestedWords.some((word) => value.includes(word))) return 'not_interested'
  if (hotLeadWords.some((word) => value.includes(word))) return 'hot_lead'
  if (interestedWords.some((word) => value.includes(word))) return 'interested'
  if (followUpWords.some((word) => value.includes(word))) return 'follow_up'

  return 'neutral'
}

function getReplyBody(row) {
  return cleanText(row?.body || row?.message || row?.media_caption || row?.caption || '')
}

function getJobCreatedAt(job) {
  return job.created_at || job.createdAt || job.started_at || job.updated_at || null
}

function getItemTime(item, job) {
  const safeItem = item || {}
  const safeJob = job || {}

  return (
    safeItem.processed_at ||
    safeItem.sent_at ||
    safeItem.updated_at ||
    safeItem.created_at ||
    getJobCreatedAt(safeJob)
  )
}

function getJobName(job) {
  return (
    cleanText(job.name) ||
    cleanText(job.job_name) ||
    cleanText(job.title) ||
    cleanText(job.database_name) ||
    'Campaign'
  )
}

function getJobType(job) {
  return cleanText(job.type || job.job_type || job.send_mode || '-')
}

function getJobStatus(job) {
  return cleanText(job.status || job.job_status || '-')
}

function isSentStatus(status) {
  const text = normalizeStatus(status)
  return ['sent', 'delivered', 'read'].includes(text)
}

function isFailedStatus(status) {
  const text = normalizeStatus(status)
  return ['failed', 'cancelled'].includes(text)
}

function buildScore({ interested, followUp, notInterested, optOut, hotLead }) {
  const score =
    hotLead * 10 +
    interested * 5 +
    followUp * 3 -
    notInterested * 3 -
    optOut * 5

  return Math.max(0, score)
}

async function safeSelect(table, queryBuilder) {
  try {
    const result = await queryBuilder(supabaseAdmin.from(table))

    if (result.error) return []

    return result.data || []
  } catch (error) {
    return []
  }
}

async function getJobs(req) {
  let query = supabaseAdmin
    .from('send_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (req.query.start) {
    query = query.gte('created_at', req.query.start)
  }

  if (req.query.end) {
    const end = new Date(req.query.end)
    end.setDate(end.getDate() + 1)
    query = query.lt('created_at', end.toISOString())
  }

  if (req.query.type) {
    query = query.eq('type', req.query.type)
  }

  if (req.query.status) {
    query = query.eq('status', req.query.status)
  }

  const { data, error } = await query

  if (error) throw error

  const search = cleanText(req.query.search).toLowerCase()

  if (!search) return data || []

  return (data || []).filter((job) => {
    const text = [
      job.id,
      job.name,
      job.job_name,
      job.title,
      job.database_name,
      job.type,
      job.status
    ]
      .map(cleanText)
      .join(' ')
      .toLowerCase()

    return text.includes(search)
  })
}

async function getJobItems(jobIds) {
  if (!jobIds.length) return []

  const { data, error } = await supabaseAdmin
    .from('send_job_items')
    .select('*')
    .in('job_id', jobIds)
    .limit(50000)

  if (error) throw error

  return data || []
}

async function getIncomingMessages(phones, since) {
  const safePhones = Array.from(new Set(phones.map(cleanPhone).filter(Boolean)))

  if (!safePhones.length) return []

  return safeSelect('wa_incoming_messages', (query) => {
    let builder = query
      .select('*')
      .in('phone', safePhones)
      .order('received_at', { ascending: true })
      .limit(50000)

    if (since) {
      builder = builder.gte('received_at', since)
    }

    return builder
  })
}

async function getDatabaseNames(databaseIds) {
  const ids = Array.from(new Set(databaseIds.map(cleanText).filter(Boolean)))

  if (!ids.length) return new Map()

  const rows = await safeSelect('contact_databases', (query) =>
    query
      .select('*')
      .in('id', ids)
      .limit(1000)
  )

  const map = new Map()

  for (const row of rows) {
    map.set(row.id, row.name || row.database_name || '')
  }

  return map
}

function groupByJob(items) {
  const map = new Map()

  for (const item of items || []) {
    const jobId = cleanText(item.job_id)
    if (!jobId) continue

    const list = map.get(jobId) || []
    list.push(item)
    map.set(jobId, list)
  }

  return map
}

function groupIncomingByPhone(messages) {
  const map = new Map()

  for (const message of messages || []) {
    const phone = cleanPhone(message.phone)
    if (!phone) continue

    const list = map.get(phone) || []
    list.push(message)
    map.set(phone, list)
  }

  return map
}

function getFirstReplyForContact({ phone, item, job, incomingByPhone }) {
  const messages = incomingByPhone.get(phone) || []
  const startTime = getTime(getItemTime(item, job))

  for (const message of messages) {
    const messageTime = getTime(message.received_at)

    if (messageTime >= startTime) {
      return message
    }
  }

  return null
}

function summarizeJob({ job, items, incomingByPhone, databaseMap }) {
  const phoneMap = new Map()

  for (const item of items || []) {
    const phone = cleanPhone(item.phone)
    if (!phone) continue

    const existing = phoneMap.get(phone)
    const itemTime = getTime(getItemTime(item, job))
    const existingTime = getTime(getItemTime(existing, job))

    if (!existing || itemTime >= existingTime) {
      phoneMap.set(phone, item)
    }
  }

  const uniqueItems = Array.from(phoneMap.entries())

  let sent = 0
  let failed = 0
  let replies = 0
  let interestedOnly = 0
  let followUp = 0
  let notInterested = 0
  let optOut = 0
  let hotLead = 0

  for (const [phone, item] of uniqueItems) {
    const itemStatus = normalizeStatus(item.status)

    if (isSentStatus(itemStatus)) sent += 1
    if (isFailedStatus(itemStatus)) failed += 1

    const firstReply = getFirstReplyForContact({
      phone,
      item,
      job,
      incomingByPhone
    })

    if (!firstReply) continue

    replies += 1

    const bucket = classifyReply(getReplyBody(firstReply))

    if (bucket === 'hot_lead') hotLead += 1
    else if (bucket === 'interested') interestedOnly += 1
    else if (bucket === 'follow_up') followUp += 1
    else if (bucket === 'not_interested') notInterested += 1
    else if (bucket === 'opt_out') optOut += 1
  }

  const interested = interestedOnly + hotLead
  const target = uniqueItems.length
  const rate = sent > 0 ? Math.round((replies / sent) * 100) : 0
  const cost = sent * 350

  return {
    job_id: job.id,
    id: job.id,
    job_name: getJobName(job),
    name: getJobName(job),
    database_name:
      cleanText(job.database_name) ||
      databaseMap.get(job.database_id) ||
      '',
    database_id: job.database_id || null,
    type: getJobType(job),
    status: getJobStatus(job),
    created_at: getJobCreatedAt(job),
    target,
    total_items: target,
    sent,
    failed,
    replies,
    interested,
    interested_count: interested,
    follow_up: followUp,
    follow_up_count: followUp,
    not_interested: notInterested,
    not_interested_count: notInterested,
    opt_out: optOut,
    opt_out_count: optOut,
    hot_lead: hotLead,
    hot_lead_count: hotLead,
    score: buildScore({
      interested,
      followUp,
      notInterested,
      optOut,
      hotLead
    }),
    cost,
    estimated_cost: cost,
    rate
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    await requireRole(req, res, ['master', 'admin', 'user', 'agent'])

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const jobs = await getJobs(req)
    const jobIds = jobs.map((job) => job.id).filter(Boolean)

    const jobItems = await getJobItems(jobIds)
    const itemsByJob = groupByJob(jobItems)

    const phones = jobItems.map((item) => item.phone)
    const earliestJobTime = jobs
      .map((job) => getTime(getJobCreatedAt(job)))
      .filter(Boolean)
      .sort((a, b) => a - b)[0]

    const incomingMessages = await getIncomingMessages(
      phones,
      earliestJobTime ? new Date(earliestJobTime).toISOString() : null
    )

    const incomingByPhone = groupIncomingByPhone(incomingMessages)

    const databaseMap = await getDatabaseNames(jobs.map((job) => job.database_id))

    const items = jobs.map((job) =>
      summarizeJob({
        job,
        items: itemsByJob.get(job.id) || [],
        incomingByPhone,
        databaseMap
      })
    )

    const summary = items.reduce(
      (acc, item) => {
        acc.jobs += 1
        acc.target += toNumber(item.target)
        acc.sent += toNumber(item.sent)
        acc.failed += toNumber(item.failed)
        acc.replies += toNumber(item.replies)
        acc.interested += toNumber(item.interested)
        acc.follow_up += toNumber(item.follow_up)
        acc.not_interested += toNumber(item.not_interested)
        acc.opt_out += toNumber(item.opt_out)
        acc.hot_lead += toNumber(item.hot_lead)
        acc.cost += toNumber(item.cost)
        return acc
      },
      {
        jobs: 0,
        target: 0,
        sent: 0,
        failed: 0,
        replies: 0,
        interested: 0,
        follow_up: 0,
        not_interested: 0,
        opt_out: 0,
        hot_lead: 0,
        cost: 0
      }
    )

    return res.status(200).json({
      success: true,
      items,
      rows: items,
      summary
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memuat job performance.'
    })
  }
}