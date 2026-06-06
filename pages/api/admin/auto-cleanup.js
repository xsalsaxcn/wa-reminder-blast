import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function isRunnerAuthorized(req) {
  const expected = process.env.JOB_RUNNER_SECRET
  const headerSecret = req.headers['x-job-runner-secret']
  const querySecret = req.query.secret

  if (!expected) return false

  return headerSecret === expected || querySecret === expected
}

function hoursAgoIso(hours) {
  return new Date(Date.now() - Number(hours) * 60 * 60 * 1000).toISOString()
}

function daysAgoIso(days) {
  return new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString()
}

async function getLastCleanupRun() {
  const { data, error } = await supabaseAdmin
    .from('maintenance_runs')
    .select('*')
    .eq('name', 'auto_cleanup')
    .eq('status', 'success')
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) throw error

  return data?.[0] || null
}

async function shouldRunCleanup() {
  const enabled = String(process.env.AUTO_CLEANUP_ENABLED || 'true') === 'true'

  if (!enabled) {
    return {
      shouldRun: false,
      reason: 'Auto cleanup disabled'
    }
  }

  const intervalHours = Number(process.env.AUTO_CLEANUP_INTERVAL_HOURS || 24)
  const lastRun = await getLastCleanupRun()

  if (!lastRun) {
    return {
      shouldRun: true,
      reason: 'No previous cleanup run'
    }
  }

  const cutoff = hoursAgoIso(intervalHours)

  if (lastRun.created_at < cutoff) {
    return {
      shouldRun: true,
      reason: `Last cleanup older than ${intervalHours} hours`
    }
  }

  return {
    shouldRun: false,
    reason: `Cleanup already ran within ${intervalHours} hours`,
    lastRun
  }
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

async function insertMaintenanceRun({ status, message, meta }) {
  await supabaseAdmin
    .from('maintenance_runs')
    .insert({
      name: 'auto_cleanup',
      status,
      message,
      meta: meta || {}
    })
}

export default async function handler(req, res) {
  const isRunner = isRunnerAuthorized(req)

  if (!isRunner) {
    const authUser = requireRole(req, res, ['master'])
    if (!authUser) return
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const check = await shouldRunCleanup()

    if (!check.shouldRun) {
      return res.status(200).json({
        success: true,
        skipped: true,
        message: check.reason,
        lastRun: check.lastRun || null
      })
    }

    const logRetentionDays =
      req.query.logRetentionDays ||
      req.body?.logRetentionDays ||
      process.env.LOG_RETENTION_DAYS ||
      90

    const jobRetentionDays =
      req.query.jobRetentionDays ||
      req.body?.jobRetentionDays ||
      process.env.JOB_RETENTION_DAYS ||
      30

    const logCutoff = await deleteOldLogs(logRetentionDays)
    const jobCutoff = await deleteOldJobs(jobRetentionDays)

    const message = `Auto cleanup selesai. Logs > ${logRetentionDays} hari dan jobs selesai > ${jobRetentionDays} hari dihapus.`

    await insertMaintenanceRun({
      status: 'success',
      message,
      meta: {
        logRetentionDays: Number(logRetentionDays),
        jobRetentionDays: Number(jobRetentionDays),
        logCutoff,
        jobCutoff
      }
    })

    return res.status(200).json({
      success: true,
      skipped: false,
      message,
      logRetentionDays: Number(logRetentionDays),
      jobRetentionDays: Number(jobRetentionDays),
      logCutoff,
      jobCutoff
    })
  } catch (error) {
    await insertMaintenanceRun({
      status: 'failed',
      message: error.message || 'Auto cleanup gagal',
      meta: {}
    })

    return res.status(500).json({
      success: false,
      message: error.message || 'Auto cleanup gagal'
    })
  }
}
