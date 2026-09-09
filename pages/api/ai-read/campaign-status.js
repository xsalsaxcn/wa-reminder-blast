// NOTIVA_PATCH_07_SAFE_JOTFORM_LIVE_READ_ONLY_V1
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import {
  DELIVERED_STATUSES,
  FAILED_STATUSES,
  PENDING_STATUSES,
  READ_STATUSES,
  SENT_STATUSES,
  ageMinutes,
  cleanText,
  readInput,
  requireAiReadToken,
  requireReadOnlyMethod,
  sanitizeSearchTerm,
  setReadOnlyHeaders
} from '../../../lib/notivaAiReadOnly'

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanText(value))
}

function normalize(value) {
  return cleanText(value).toLowerCase().replace(/\s+/g, ' ')
}

function scoreJob(job, q) {
  const needle = normalize(q)
  if (!needle) return 0

  const values = [job.name, job.title, job.project_name, job.batch_name]
    .map(normalize)
    .filter(Boolean)

  let score = 0
  for (const value of values) {
    if (value === needle) score = Math.max(score, 100)
    else if (value.startsWith(needle)) score = Math.max(score, 80)
    else if (value.includes(needle)) score = Math.max(score, 60)
  }

  return score
}

async function findJobs(q) {
  if (isUuid(q)) {
    const result = await supabaseAdmin
      .from('send_jobs')
      .select('id, name, title, type, status, campaign_type, project_name, batch_name, database_id, total, total_items, sent, failed, created_at, updated_at')
      .eq('id', q)
      .limit(1)

    if (result.error) throw result.error
    return result.data || []
  }

  const term = sanitizeSearchTerm(q)
  if (!term) return []

  const result = await supabaseAdmin
    .from('send_jobs')
    .select('id, name, title, type, status, campaign_type, project_name, batch_name, database_id, total, total_items, sent, failed, created_at, updated_at')
    .or(`name.ilike.%${term}%,title.ilike.%${term}%,project_name.ilike.%${term}%,batch_name.ilike.%${term}%`)
    .order('created_at', { ascending: false })
    .limit(20)

  if (result.error) throw result.error

  return (result.data || [])
    .map((job) => ({ job, score: scoreJob(job, q) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return new Date(b.job.created_at || 0).getTime() - new Date(a.job.created_at || 0).getTime()
    })
    .map((entry) => entry.job)
}

async function countItems(jobId, statuses, scheduleMode = '') {
  let query = supabaseAdmin
    .from('send_job_items')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', jobId)

  if (statuses?.length) query = query.in('status', statuses)

  const now = new Date().toISOString()
  if (scheduleMode === 'future') query = query.gt('scheduled_at', now)
  if (scheduleMode === 'due') query = query.not('scheduled_at', 'is', null).lte('scheduled_at', now)
  if (scheduleMode === 'unscheduled') query = query.is('scheduled_at', null)

  const result = await query
  if (result.error) throw result.error
  return Number(result.count || 0)
}

export default async function handler(req, res) {
  setReadOnlyHeaders(res)

  if (!requireReadOnlyMethod(req, res)) return
  if (!requireAiReadToken(req, res)) return

  try {
    const q = readInput(req, ['q', 'campaign', 'campaign_name', 'job_id', 'name'])

    if (!q) {
      return res.status(400).json({
        success: false,
        read_only: true,
        message: 'Parameter q/campaign/job_id wajib diisi.'
      })
    }

    const jobs = await findJobs(q)

    if (!jobs.length) {
      return res.status(404).json({
        success: false,
        read_only: true,
        query: q,
        message: 'Campaign/job tidak ditemukan.',
        safe_answer: `Campaign yang cocok dengan "${q}" belum ditemukan.`
      })
    }

    const job = jobs[0]
    const jobId = job.id

    const [
      total,
      pending,
      sent,
      delivered,
      read,
      failed,
      futurePending,
      duePending,
      unscheduledPending,
      nextScheduleResult,
      failureResult
    ] = await Promise.all([
      countItems(jobId),
      countItems(jobId, PENDING_STATUSES),
      countItems(jobId, SENT_STATUSES),
      countItems(jobId, DELIVERED_STATUSES),
      countItems(jobId, READ_STATUSES),
      countItems(jobId, FAILED_STATUSES),
      countItems(jobId, PENDING_STATUSES, 'future'),
      countItems(jobId, PENDING_STATUSES, 'due'),
      countItems(jobId, PENDING_STATUSES, 'unscheduled'),
      supabaseAdmin
        .from('send_job_items')
        .select('scheduled_at')
        .eq('job_id', jobId)
        .in('status', PENDING_STATUSES)
        .gt('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(1),
      supabaseAdmin
        .from('send_job_items')
        .select('status, error_message, updated_at, processed_at')
        .eq('job_id', jobId)
        .in('status', FAILED_STATUSES)
        .order('updated_at', { ascending: false })
        .limit(5)
    ])

    if (nextScheduleResult.error) throw nextScheduleResult.error
    if (failureResult.error) throw failureResult.error

    const known = pending + sent + delivered + read + failed
    const other = Math.max(0, total - known)
    const assessment = []

    if (duePending > 0) {
      assessment.push(`${duePending} item pending sudah mencapai scheduled_at dan masih menunggu diproses.`)
    }
    if (futurePending > 0) {
      assessment.push(`${futurePending} item masih menunggu jadwal kirim di masa depan.`)
    }
    if (unscheduledPending > 0) {
      assessment.push(`${unscheduledPending} item pending belum memiliki scheduled_at; worker mode terjadwal tidak akan mengirim item tersebut sampai jadwal tersedia.`)
    }
    if (failed > 0) {
      assessment.push(`${failed} item berada pada status gagal/error.`)
    }

    const staleMinutes = ageMinutes(job.updated_at)
    if (duePending > 0 && staleMinutes !== null && staleMinutes >= 10) {
      assessment.push(`Job terakhir diperbarui sekitar ${staleMinutes} menit lalu sementara masih ada item yang sudah due; cek worker/queue bila angka tidak bergerak.`)
    }
    if (!assessment.length && pending === 0) {
      assessment.push('Tidak ada item pending pada job ini.')
    }

    const failureExamples = (failureResult.data || []).map((row) => ({
      status: cleanText(row.status),
      reason: cleanText(row.error_message) || 'Tidak ada detail error',
      at: row.processed_at || row.updated_at || null
    }))

    const alternatives = jobs.slice(1, 5).map((item) => ({
      id: item.id,
      name: cleanText(item.name || item.title),
      status: cleanText(item.status),
      created_at: item.created_at || null
    }))

    const campaignName = cleanText(job.name || job.title || job.project_name || job.id)

    return res.status(200).json({
      success: true,
      read_only: true,
      query: q,
      matched_campaign: {
        id: job.id,
        name: campaignName,
        type: cleanText(job.campaign_type || job.type),
        project_name: cleanText(job.project_name),
        batch_name: cleanText(job.batch_name),
        status: cleanText(job.status),
        created_at: job.created_at || null,
        updated_at: job.updated_at || null
      },
      counts: {
        total,
        pending,
        pending_due: duePending,
        pending_future: futurePending,
        pending_without_schedule: unscheduledPending,
        sent,
        delivered,
        read,
        failed,
        other
      },
      next_scheduled_at: nextScheduleResult.data?.[0]?.scheduled_at || null,
      assessment,
      recent_failure_examples: failureExamples,
      alternative_matches: alternatives,
      generated_at: new Date().toISOString(),
      safe_answer: `${campaignName}: total ${total}, pending ${pending}, sent ${sent}, delivered ${delivered}, read ${read}, failed ${failed}. ${assessment.join(' ')}`
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      read_only: true,
      message: error.message || 'Gagal membaca status campaign.'
    })
  }
}
