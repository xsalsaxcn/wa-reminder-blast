import { supabaseAdmin } from './supabaseAdmin'

const DAY_MS = 24 * 60 * 60 * 1000

function toLocalStartIso(dateText) {
  if (!dateText) return null
  return new Date(`${dateText}T00:00:00+07:00`).toISOString()
}

function toLocalEndIso(dateText) {
  if (!dateText) return null
  return new Date(`${dateText}T23:59:59+07:00`).toISOString()
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '')
}

function safeMessage(text) {
  return String(text || '').trim()
}

function getPaidRate() {
  return Number(process.env.WA_ESTIMATED_PAID_MESSAGE_COST_IDR || 0)
}

function findLastIncoming(phone, sentAt, incomingByPhone) {
  const list = incomingByPhone.get(phone) || []
  const sentTime = new Date(sentAt).getTime()

  let latest = null

  for (const item of list) {
    const receivedTime = new Date(item.received_at).getTime()

    if (receivedTime <= sentTime) {
      if (!latest || receivedTime > new Date(latest.received_at).getTime()) {
        latest = item
      }
    }
  }

  return latest
}

function buildBillingInfo({ status, sentAt, phone, incomingByPhone }) {
  const paidRate = getPaidRate()

  if (status !== 'sent') {
    return {
      last_incoming_at: null,
      is_24h_window: false,
      billing_type: 'Failed / tidak dihitung',
      estimated_cost_idr: 0
    }
  }

  const lastIncoming = findLastIncoming(phone, sentAt, incomingByPhone)

  if (!lastIncoming) {
    return {
      last_incoming_at: null,
      is_24h_window: false,
      billing_type: 'Di luar 24 jam / estimasi paid',
      estimated_cost_idr: paidRate
    }
  }

  const sentTime = new Date(sentAt).getTime()
  const incomingTime = new Date(lastIncoming.received_at).getTime()
  const within24h = sentTime - incomingTime <= DAY_MS

  return {
    last_incoming_at: lastIncoming.received_at,
    is_24h_window: within24h,
    billing_type: within24h
      ? 'Free-form 24 jam'
      : 'Di luar 24 jam / estimasi paid',
    estimated_cost_idr: within24h ? 0 : paidRate
  }
}

export async function buildUsageRows(filters = {}) {
  const {
    start,
    end,
    source = 'all',
    status = 'all',
    job_id = '',
    limit = 5000
  } = filters

  const startIso = toLocalStartIso(start)
  const endIso = toLocalEndIso(end)

  const incomingStartIso = startIso
    ? new Date(new Date(startIso).getTime() - DAY_MS).toISOString()
    : null

  let outgoingQuery = supabaseAdmin
    .from('wa_outgoing_messages')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(Number(limit))

  if (startIso) outgoingQuery = outgoingQuery.gte('sent_at', startIso)
  if (endIso) outgoingQuery = outgoingQuery.lte('sent_at', endIso)

  const { data: outgoingMessages, error: outgoingError } = await outgoingQuery

  if (outgoingError) {
    throw new Error(outgoingError.message)
  }

  let jobItemQuery = supabaseAdmin
    .from('send_job_items')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Number(limit))

  if (startIso) jobItemQuery = jobItemQuery.gte('created_at', startIso)
  if (endIso) jobItemQuery = jobItemQuery.lte('created_at', endIso)

  if (job_id && job_id !== 'all') {
    jobItemQuery = jobItemQuery.eq('job_id', job_id)
  }

  const { data: jobItems, error: jobItemError } = await jobItemQuery

  if (jobItemError) {
    throw new Error(jobItemError.message)
  }

  const jobIds = Array.from(
    new Set((jobItems || []).map((item) => item.job_id).filter(Boolean))
  )

  let jobsMap = new Map()

  if (jobIds.length > 0) {
    const { data: jobs, error: jobsError } = await supabaseAdmin
      .from('send_jobs')
      .select('id, type, database_id, status, created_at')
      .in('id', jobIds)

    if (jobsError) {
      throw new Error(jobsError.message)
    }

    jobsMap = new Map((jobs || []).map((job) => [job.id, job]))
  }

  let incomingQuery = supabaseAdmin
    .from('wa_incoming_messages')
    .select('id, phone, profile_name, body, received_at')
    .order('received_at', { ascending: false })
    .limit(10000)

  if (incomingStartIso) incomingQuery = incomingQuery.gte('received_at', incomingStartIso)
  if (endIso) incomingQuery = incomingQuery.lte('received_at', endIso)

  const { data: incomingMessages, error: incomingError } = await incomingQuery

  if (incomingError) {
    throw new Error(incomingError.message)
  }

  const incomingByPhone = new Map()

  for (const item of incomingMessages || []) {
    const phone = normalizePhone(item.phone)
    if (!phone) continue

    if (!incomingByPhone.has(phone)) {
      incomingByPhone.set(phone, [])
    }

    incomingByPhone.get(phone).push(item)
  }

  const rows = []

  for (const item of outgoingMessages || []) {
    const phone = normalizePhone(item.phone)
    const sentAt = item.sent_at

    if (!phone || !sentAt) continue

    const rowStatus = item.status || 'sent'

    const billing = buildBillingInfo({
      status: rowStatus,
      sentAt,
      phone,
      incomingByPhone
    })

    rows.push({
      id: `outgoing-${item.id}`,
      source: 'inbox_reply',
      source_label: 'Inbox Reply',
      job_id: null,
      job_type: null,
      phone,
      message: safeMessage(item.message),
      status: rowStatus,
      sent_at: sentAt,
      meta_message_id: item.meta_message_id || null,
      error_message: item.error_message || null,
      ...billing
    })
  }

  for (const item of jobItems || []) {
    const phone = normalizePhone(item.phone)
    const sentAt = item.processed_at || item.created_at

    if (!phone || !sentAt) continue

    const job = jobsMap.get(item.job_id)
    const jobType = job?.type || 'job'
    const rowStatus = item.status || 'pending'

    const billing = buildBillingInfo({
      status: rowStatus,
      sentAt,
      phone,
      incomingByPhone
    })

    rows.push({
      id: `job-${item.id}`,
      source: jobType,
      source_label:
        jobType === 'blast'
          ? 'WhatsApp Blast'
          : jobType === 'reminder'
            ? 'Reminder'
            : 'Job Queue',
      job_id: item.job_id || null,
      job_type: jobType,
      phone,
      message: safeMessage(item.message),
      status: rowStatus,
      sent_at: sentAt,
      meta_message_id: item.meta_message_id || null,
      error_message: item.error_message || null,
      ...billing
    })
  }

  let filteredRows = rows

  if (source && source !== 'all') {
    if (source === 'job') {
      filteredRows = filteredRows.filter((row) => row.source !== 'inbox_reply')
    } else {
      filteredRows = filteredRows.filter((row) => row.source === source)
    }
  }

  if (status && status !== 'all') {
    filteredRows = filteredRows.filter((row) => row.status === status)
  }

  filteredRows = filteredRows.sort((a, b) => {
    return new Date(b.sent_at || 0) - new Date(a.sent_at || 0)
  })

  const summary = {
    total: filteredRows.length,
    sent: filteredRows.filter((row) => row.status === 'sent').length,
    failed: filteredRows.filter((row) => row.status === 'failed').length,
    pending: filteredRows.filter((row) => row.status === 'pending').length,
    freeWindow: filteredRows.filter((row) => row.is_24h_window).length,
    outsideWindow: filteredRows.filter(
      (row) => row.status === 'sent' && !row.is_24h_window
    ).length,
    estimatedCostIdr: filteredRows.reduce(
      (sum, row) => sum + Number(row.estimated_cost_idr || 0),
      0
    )
  }

  return {
    rows: filteredRows.slice(0, Number(limit)),
    summary
  }
}