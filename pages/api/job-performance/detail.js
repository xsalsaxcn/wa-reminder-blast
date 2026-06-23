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
    'berminat',
    'minat',
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

function getItemTime(item, job) {
  const safeItem = item || {}
  const safeJob = job || {}

  return (
    safeItem.processed_at ||
    safeItem.sent_at ||
    safeItem.updated_at ||
    safeItem.created_at ||
    safeJob.created_at ||
    safeJob.updated_at ||
    null
  )
}

function isSentStatus(status) {
  const text = normalizeStatus(status)
  return ['sent', 'delivered', 'read'].includes(text)
}

function isFailedStatus(status) {
  const text = normalizeStatus(status)
  return ['failed', 'cancelled'].includes(text)
}

function bucketMatches(bucket, detail) {
  const selected = cleanText(bucket).toLowerCase()

  if (selected === 'target') return true
  if (selected === 'sent') return detail.sent
  if (selected === 'failed') return detail.failed
  if (selected === 'replies') return detail.hasReply
  if (selected === 'no_response') return detail.sent && !detail.hasReply
  if (selected === 'interested') {
    return detail.replyBucket === 'interested' || detail.replyBucket === 'hot_lead'
  }
  if (selected === 'follow_up') return detail.replyBucket === 'follow_up'
  if (selected === 'not_interested') return detail.replyBucket === 'not_interested'
  if (selected === 'opt_out') return detail.replyBucket === 'opt_out'
  if (selected === 'hot_lead') return detail.replyBucket === 'hot_lead'
  if (selected === 'score') return detail.hasReply || detail.sent || detail.failed

  return true
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

async function getJob(jobId) {
  const { data, error } = await supabaseAdmin
    .from('send_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle()

  if (error) throw error

  return data || null
}

async function getJobItems(jobId) {
  const { data, error } = await supabaseAdmin
    .from('send_job_items')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
    .limit(50000)

  if (error) throw error

  return data || []
}

async function getIncomingByPhones(phones, since) {
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

async function getContactsByPhones(phones) {
  const safePhones = Array.from(new Set(phones.map(cleanPhone).filter(Boolean)))

  if (!safePhones.length) return []

  return safeSelect('contacts', (query) =>
    query
      .select('*')
      .in('phone', safePhones)
      .limit(50000)
  )
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

function getName(contact, fallback) {
  return (
    cleanText(contact?.name) ||
    cleanText(contact?.profile_name) ||
    cleanText(contact?.full_name) ||
    fallback
  )
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

    const jobId = cleanText(req.query.job_id || req.query.jobId || req.query.id)
    const bucket = cleanText(req.query.bucket || 'replies').toLowerCase()

    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: 'job_id wajib diisi.'
      })
    }

    const job = await getJob(jobId)

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job tidak ditemukan.'
      })
    }

    const jobItems = await getJobItems(jobId)

    const phoneMap = new Map()

    for (const item of jobItems || []) {
      const phone = cleanPhone(item.phone)
      if (!phone) continue

      const existing = phoneMap.get(phone)
      const itemTime = getTime(getItemTime(item, job))
      const existingTime = getTime(getItemTime(existing, job))

      if (!existing || itemTime >= existingTime) {
        phoneMap.set(phone, item)
      }
    }

    const phones = Array.from(phoneMap.keys())
    const earliestTime = job.created_at || job.updated_at || null

    const incomingMessages = await getIncomingByPhones(phones, earliestTime)
    const incomingByPhone = groupIncomingByPhone(incomingMessages)
    const contacts = await getContactsByPhones(phones)

    const contactMap = new Map()

    for (const contact of contacts || []) {
      const phone = cleanPhone(contact.phone)
      if (!phone) continue
      contactMap.set(phone, contact)
    }

    const rows = []

    for (const [phone, item] of phoneMap.entries()) {
      const firstReply = getFirstReplyForContact({
        phone,
        item,
        job,
        incomingByPhone
      })

      const replyText = getReplyBody(firstReply)
      const replyBucket = classifyReply(replyText)
      const status = normalizeStatus(item.status)
      const contact = contactMap.get(phone)

      const detail = {
        phone,
        name: getName(contact, phone),
        status,
        sent: isSentStatus(status),
        failed: isFailedStatus(status),
        hasReply: Boolean(firstReply),
        replyCount: firstReply ? 1 : 0,
        replyBucket,
        lastReply: replyText,
        lastReplyAt: firstReply?.received_at || null,
        lastMessage: item.message || '',
        processedAt: getItemTime(item, job),
        metaMessageId: item.meta_message_id || null,
        inboxUrl: `/inbox?phone=${encodeURIComponent(phone)}`
      }

      if (bucketMatches(bucket, detail)) {
        rows.push(detail)
      }
    }

    rows.sort((a, b) => {
      const bTime = getTime(b.lastReplyAt || b.processedAt)
      const aTime = getTime(a.lastReplyAt || a.processedAt)
      return bTime - aTime
    })

    return res.status(200).json({
      success: true,
      job,
      bucket,
      total: rows.length,
      rows
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memuat detail job performance.'
    })
  }
}