import { supabaseAdmin } from './supabaseAdmin'
import { buildUsageRows } from './usageBuilder'

function toLocalStartIso(dateText) {
  if (!dateText) return null
  return new Date(`${dateText}T00:00:00+07:00`).toISOString()
}

function toLocalEndIso(dateText) {
  if (!dateText) return null
  return new Date(`${dateText}T23:59:59+07:00`).toISOString()
}

function getReadableNameFromObject(obj) {
  if (!obj) return ''

  return (
    obj.name ||
    obj.database_name ||
    obj.title ||
    obj.file_name ||
    obj.filename ||
    obj.sheet_name ||
    obj.original_filename ||
    obj.upload_name ||
    ''
  )
}

function getJobName(job, database) {
  const databaseName = getReadableNameFromObject(database)

  if (databaseName) {
    return databaseName
  }

  const jobName = getReadableNameFromObject(job)

  if (jobName) {
    return jobName
  }

  return `${job?.type || 'Job'} ${String(job?.id || '').slice(0, 8)}`
}

function getStatusCount(items, status) {
  return items.filter((item) => String(item.status || '').toLowerCase() === status).length
}

function percent(value, total) {
  if (!total || total <= 0) return 0
  return Math.round((value / total) * 1000) / 10
}

export async function buildJobPerformanceRows(filters = {}) {
  const {
    start = '',
    end = '',
    type = 'all',
    status = 'all',
    q = '',
    limit = 200
  } = filters

  const startIso = toLocalStartIso(start)
  const endIso = toLocalEndIso(end)
  const search = String(q || '').trim().toLowerCase()

  let jobQuery = supabaseAdmin
    .from('send_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Number(limit))

  if (startIso) jobQuery = jobQuery.gte('created_at', startIso)
  if (endIso) jobQuery = jobQuery.lte('created_at', endIso)
  if (type && type !== 'all') jobQuery = jobQuery.eq('type', type)
  if (status && status !== 'all') jobQuery = jobQuery.eq('status', status)

  const { data: jobsRaw, error: jobsError } = await jobQuery

  if (jobsError) {
    throw new Error(jobsError.message)
  }

  let jobs = jobsRaw || []

  const databaseIds = Array.from(
    new Set(jobs.map((job) => job.database_id).filter(Boolean))
  )

  let databaseMap = new Map()

  if (databaseIds.length > 0) {
    const { data: databases, error: databaseError } = await supabaseAdmin
      .from('contact_databases')
      .select('*')
      .in('id', databaseIds)

    if (!databaseError) {
      databaseMap = new Map((databases || []).map((db) => [db.id, db]))
    }
  }

  if (search) {
    jobs = jobs.filter((job) => {
      const database = databaseMap.get(job.database_id)
      const databaseName = getReadableNameFromObject(database)

      const text = [
        job.id,
        job.type,
        job.status,
        job.name,
        job.title,
        job.job_name,
        job.campaign_name,
        job.database_name,
        job.database_id,
        databaseName
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return text.includes(search)
    })
  }

  const jobIds = jobs.map((job) => job.id).filter(Boolean)

  if (jobIds.length === 0) {
    return {
      rows: [],
      summary: {
        totalJobs: 0,
        totalTarget: 0,
        totalSent: 0,
        totalFailed: 0,
        totalReplies: 0,
        totalInterested: 0,
        totalHotLead: 0,
        estimatedCostIdr: 0
      }
    }
  }

  const { data: jobItems, error: itemsError } = await supabaseAdmin
    .from('send_job_items')
    .select('*')
    .in('job_id', jobIds)
    .limit(50000)

  if (itemsError) {
    throw new Error(itemsError.message)
  }

  const { data: analyses, error: analysisError } = await supabaseAdmin
    .from('wa_message_analysis')
    .select('*')
    .in('source_job_id', jobIds)
    .limit(50000)

  if (analysisError) {
    throw new Error(analysisError.message)
  }

  let contactScores = []

  try {
    const { data } = await supabaseAdmin
      .from('wa_contact_scores')
      .select('*')
      .in('source_job_id', jobIds)
      .limit(50000)

    contactScores = data || []
  } catch (err) {
    contactScores = []
  }

  let usageRows = []

  try {
    const usage = await buildUsageRows({
      start,
      end,
      source: 'job',
      status: 'all',
      limit: 50000
    })

    usageRows = usage.rows || []
  } catch (err) {
    usageRows = []
  }

  const itemsByJob = new Map()
  const analysisByJob = new Map()
  const scoresByJob = new Map()
  const usageByJob = new Map()

  for (const item of jobItems || []) {
    if (!itemsByJob.has(item.job_id)) itemsByJob.set(item.job_id, [])
    itemsByJob.get(item.job_id).push(item)
  }

  for (const item of analyses || []) {
    if (!analysisByJob.has(item.source_job_id)) analysisByJob.set(item.source_job_id, [])
    analysisByJob.get(item.source_job_id).push(item)
  }

  for (const item of contactScores || []) {
    if (!scoresByJob.has(item.source_job_id)) scoresByJob.set(item.source_job_id, [])
    scoresByJob.get(item.source_job_id).push(item)
  }

  for (const item of usageRows || []) {
    if (!item.job_id) continue

    if (!usageByJob.has(item.job_id)) {
      usageByJob.set(item.job_id, {
        estimatedCostIdr: 0,
        freeWindow: 0,
        outsideWindow: 0
      })
    }

    const current = usageByJob.get(item.job_id)
    current.estimatedCostIdr += Number(item.estimated_cost_idr || 0)

    if (item.is_24h_window) {
      current.freeWindow += 1
    } else if (item.status === 'sent') {
      current.outsideWindow += 1
    }
  }

  const rows = jobs.map((job) => {
    const database = databaseMap.get(job.database_id)
    const items = itemsByJob.get(job.id) || []
    const jobAnalysis = analysisByJob.get(job.id) || []
    const scores = scoresByJob.get(job.id) || []
    const usage = usageByJob.get(job.id) || {
      estimatedCostIdr: 0,
      freeWindow: 0,
      outsideWindow: 0
    }

    const uniqueReplierPhones = new Set(
      jobAnalysis.map((item) => item.phone).filter(Boolean)
    )

    const totalTarget = items.length
    const sent = getStatusCount(items, 'sent')
    const failed = getStatusCount(items, 'failed')
    const pending = getStatusCount(items, 'pending')
    const processing = getStatusCount(items, 'processing')

    const interested = jobAnalysis.filter((item) => item.label === 'Berminat').length
    const notInterested = jobAnalysis.filter((item) => item.label === 'Tidak berminat').length
    const followUp = jobAnalysis.filter((item) => item.label === 'Follow-up').length
    const neutral = jobAnalysis.filter((item) => item.label === 'Netral').length
    const optOut = jobAnalysis.filter((item) => item.label === 'Opt-out').length
    const complaint = jobAnalysis.filter((item) => item.label === 'Komplain').length

    const hotLead =
      scores.filter((item) => item.status === 'hot').length ||
      jobAnalysis.filter((item) => Number(item.score || 0) >= 80).length

    const avgScore =
      jobAnalysis.length > 0
        ? Math.round(
            jobAnalysis.reduce((sum, item) => sum + Number(item.score || 0), 0) /
              jobAnalysis.length
          )
        : 0

    return {
      id: job.id,
      job_name: getJobName(job, database),
      database_id: job.database_id || null,
      database_name: getReadableNameFromObject(database),
      type: job.type || '-',
      status: job.status || '-',
      created_at: job.created_at,
      updated_at: job.updated_at,
      total_target: totalTarget,
      sent,
      failed,
      pending,
      processing,
      replies: jobAnalysis.length,
      unique_repliers: uniqueReplierPhones.size,
      reply_rate: percent(uniqueReplierPhones.size, sent),
      interested,
      not_interested: notInterested,
      follow_up: followUp,
      neutral,
      opt_out: optOut,
      complaint,
      hot_lead: hotLead,
      avg_score: avgScore,
      free_window: usage.freeWindow,
      outside_window: usage.outsideWindow,
      estimated_cost_idr: usage.estimatedCostIdr
    }
  })

  const summary = {
    totalJobs: rows.length,
    totalTarget: rows.reduce((sum, row) => sum + row.total_target, 0),
    totalSent: rows.reduce((sum, row) => sum + row.sent, 0),
    totalFailed: rows.reduce((sum, row) => sum + row.failed, 0),
    totalReplies: rows.reduce((sum, row) => sum + row.replies, 0),
    totalInterested: rows.reduce((sum, row) => sum + row.interested, 0),
    totalHotLead: rows.reduce((sum, row) => sum + row.hot_lead, 0),
    estimatedCostIdr: rows.reduce((sum, row) => sum + row.estimated_cost_idr, 0)
  }

  return {
    rows,
    summary
  }
}