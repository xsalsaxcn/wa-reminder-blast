import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function isRunnerAuthorized(req) {
  const expected = process.env.JOB_RUNNER_SECRET
  const headerSecret = req.headers['x-job-runner-secret']
  const querySecret = req.query.secret

  if (!expected) return false

  return headerSecret === expected || querySecret === expected
}

function daysAgoIso(days) {
  return new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString()
}

async function deleteOldLogs(days) {
  const cutoff = daysAgoIso(days)

  const reminderResult = await supabaseAdmin
    .from('reminder_logs')
    .delete()
    .lt('sent_at', cutoff)

  if (reminderResult.error) throw reminderResult.error

  const blastResult = await supabaseAdmin
    .from('blast_logs')
    .delete()
    .lt('sent_at', cutoff)

  if (blastResult.error) throw blastResult.error

  return cutoff
}

async function deleteOldJobs(days) {
  const cutoff = daysAgoIso(days)

  const { error } = await supabaseAdmin
    .from('send_jobs')
    .delete()
    .in('status', ['done', 'failed'])
    .lt('updated_at', cutoff)

  if (error) throw error

  return cutoff
}

export default async function handler(req, res) {
  const isRunner = isRunnerAuthorized(req)

  if (!isRunner) {
    const authUser = requireRole(req, res, ['master'])
    if (!authUser) return
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const logRetentionDays =
      req.body?.logRetentionDays ||
      req.query.logRetentionDays ||
      process.env.LOG_RETENTION_DAYS ||
      90

    const jobRetentionDays =
      req.body?.jobRetentionDays ||
      req.query.jobRetentionDays ||
      process.env.JOB_RETENTION_DAYS ||
      30

    const logCutoff = await deleteOldLogs(logRetentionDays)
    const jobCutoff = await deleteOldJobs(jobRetentionDays)

    return res.status(200).json({
      success: true,
      message: `Cleanup selesai. Logs lebih lama dari ${logRetentionDays} hari dan jobs selesai lebih lama dari ${jobRetentionDays} hari dihapus.`,
      logRetentionDays: Number(logRetentionDays),
      jobRetentionDays: Number(jobRetentionDays),
      logCutoff,
      jobCutoff
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Cleanup gagal'
    })
  }
}
