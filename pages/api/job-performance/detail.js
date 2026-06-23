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

function getCreatedAt(row) {
  return (
    row?.created_at ||
    row?.createdAt ||
    row?.started_at ||
    row?.updated_at ||
    row?.processed_at ||
    null
  )
}

function getMessageText(row) {
  return cleanText(
    row?.body ||
      row?.message ||
      row?.last_message ||
      row?.media_caption ||
      row?.caption ||
      ''
  )
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
    'harga',
    'proposal',
    'penawaran',
    'bisa ka',
    'bisa kak'
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
    'ya',
    'daftar',
    'ikut'
  ]

  const hotLeadWords = [
    'daftar',
    'mau daftar',
    'ikut',
    'berminat',
    'minta penawaran',
    'buatkan penawaran',
    'proposal',
    'bisa ka',
    'bisa kak'
  ]

  if (optOutWords.some((word) => value.includes(word))) return 'opt_out'
  if (notInterestedWords.some((word) => value.includes(word))) return 'not_interested'
  if (hotLeadWords.some((word) => value.includes(word))) return 'hot_lead'
  if (interestedWords.some((word) => value.includes(word))) return 'interested'
  if (followUpWords.some((word) => value.includes(word))) return 'follow_up'

  return 'reply'
}

function bucketMatches(bucket, item) {
  const selected = cleanText(bucket).toLowerCase()

  if (selected === 'target') return true
  if (selected === 'sent') return item.sent
  if (selected === 'failed') return item.failed
  if (selected === 'replies') return item.hasReply
  if (selected === 'interested') return item.replyBucket === 'interested' || item.replyBucket === 'hot_lead'
  if (selected === 'follow_up') return item.replyBucket === 'follow_up'
  if (selected === 'not_interested') return item.replyBucket === 'not_interested'
  if (selected === 'opt_out') return item.replyBucket === 'opt_out'
  if (selected === 'hot_lead') return item.replyBucket === 'hot_lead'
  if (selected === 'score') return item.hasReply || item.sent || item.failed

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
    .limit(10000)

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
      .order('received_at', { ascending: false })
      .limit(5000)

    if (since) {
      builder = builder.gte('received_at', since)
    }

    return builder
  })
}

async function getDeliveryLogsByJob(jobId) {
  return safeSelect('send_delivery_logs', (query) =>
    query
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(10000)
  )
}

async function getContactsByPhones(phones) {
  const safePhones = Array.from(new Set(phones.map(cleanPhone).filter(Boolean)))

  if (!safePhones.length) return []

  return safeSelect('contacts', (query) =>
    query
      .select('*')
      .in('phone', safePhones)
      .limit(10000)
  )
}

function getNameFromContact(contact, fallbackPhone) {
  return (
    cleanText(contact?.name) ||
    cleanText(contact?.profile_name) ||
    cleanText(contact?.full_name) ||
    fallbackPhone
  )
}

function normalizeStatus(status) {
  const text = cleanText(status).toLowerCase()

  if (text === 'success') return 'sent'
  if (text === 'done') return 'sent'
  if (text === 'completed') return 'sent'
  if (text === 'error') return 'failed'

  return text || 'pending'
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

    const jobCreatedAt = getCreatedAt(job)
    const jobItems = await getJobItems(jobId)
    const deliveryLogs = await getDeliveryLogsByJob(jobId)

    const phonesFromItems = jobItems.map((item) => item.phone)
    const phonesFromLogs = deliveryLogs.map((item) => item.phone)
    const phones = Array.from(new Set([...phonesFromItems, ...phonesFromLogs].map(cleanPhone).filter(Boolean)))

    const incomingMessages = await getIncomingByPhones(phones, jobCreatedAt)
    const contacts = await getContactsByPhones(phones)

    const contactMap = new Map()
    for (const contact of contacts) {
      const phone = cleanPhone(contact.phone)
      if (!phone) continue
      contactMap.set(phone, contact)
    }

    const incomingByPhone = new Map()
    for (const message of incomingMessages) {
      const phone = cleanPhone(message.phone)
      if (!phone) continue

      const list = incomingByPhone.get(phone) || []
      list.push(message)
      incomingByPhone.set(phone, list)
    }

    const logByPhone = new Map()
    for (const log of deliveryLogs) {
      const phone = cleanPhone(log.phone)
      if (!phone) continue

      const list = logByPhone.get(phone) || []
      list.push(log)
      logByPhone.set(phone, list)
    }

    const itemByPhone = new Map()
    for (const item of jobItems) {
      const phone = cleanPhone(item.phone)
      if (!phone) continue

      const existing = itemByPhone.get(phone)
      const itemTime = getTime(item.processed_at || item.updated_at || item.created_at)
      const existingTime = getTime(existing?.processed_at || existing?.updated_at || existing?.created_at)

      if (!existing || itemTime >= existingTime) {
        itemByPhone.set(phone, item)
      }
    }

    const rows = []

    for (const phone of phones) {
      const item = itemByPhone.get(phone) || {}
      const logs = logByPhone.get(phone) || []
      const replies = incomingByPhone.get(phone) || []
      const latestReply = replies[0] || null
      const latestLog = logs[0] || null

      const itemStatus = normalizeStatus(item.status)
      const logStatus = normalizeStatus(latestLog?.status)
      const finalStatus = itemStatus || logStatus

      const replyText = getMessageText(latestReply)
      const replyBucket = classifyReply(replyText)

      const sent =
        finalStatus === 'sent' ||
        finalStatus === 'delivered' ||
        finalStatus === 'read' ||
        finalStatus === 'success'

      const failed =
        finalStatus === 'failed' ||
        finalStatus === 'error'

      const contact = contactMap.get(phone)

      const detail = {
        phone,
        name: getNameFromContact(contact, phone),
        status: finalStatus || 'pending',
        sent,
        failed,
        hasReply: replies.length > 0,
        replyCount: replies.length,
        replyBucket,
        lastReply: replyText,
        lastReplyAt: latestReply?.received_at || null,
        lastMessage: item.message || latestLog?.message || '',
        processedAt: item.processed_at || latestLog?.created_at || null,
        metaMessageId:
          item.meta_message_id ||
          latestLog?.meta_message_id ||
          latestLog?.meta_response?.messages?.[0]?.id ||
          null,
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