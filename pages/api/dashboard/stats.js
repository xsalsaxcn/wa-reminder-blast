import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function applyDateFilter(query, column, start, end) {
  let nextQuery = query

  if (start) {
    nextQuery = nextQuery.gte(column, `${start}T00:00:00`)
  }

  if (end) {
    nextQuery = nextQuery.lte(column, `${end}T23:59:59`)
  }

  return nextQuery
}

function countStatus(rows, status) {
  return (rows || []).filter((item) => item.status === status).length
}

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin', 'user', 'agent'])
  if (!authUser) return

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const { start = '', end = '' } = req.query

    const [
      databasesResult,
      contactsResult,
      reminderLogsResult,
      blastLogsResult,
      jobsResult
    ] = await Promise.all([
      supabaseAdmin
        .from('contact_databases')
        .select('*')
        .order('created_at', { ascending: false }),

      supabaseAdmin
        .from('contacts')
        .select('*'),

      applyDateFilter(
        supabaseAdmin
          .from('reminder_logs')
          .select('*')
          .order('sent_at', { ascending: false }),
        'sent_at',
        start,
        end
      ),

      applyDateFilter(
        supabaseAdmin
          .from('blast_logs')
          .select('*')
          .order('sent_at', { ascending: false }),
        'sent_at',
        start,
        end
      ),

      supabaseAdmin
        .from('send_jobs')
        .select(`
          *,
          contact_databases (
            name,
            type
          )
        `)
        .order('created_at', { ascending: false })
        .limit(10)
    ])

    if (databasesResult.error) throw databasesResult.error
    if (contactsResult.error) throw contactsResult.error
    if (reminderLogsResult.error) throw reminderLogsResult.error
    if (blastLogsResult.error) throw blastLogsResult.error
    if (jobsResult.error) throw jobsResult.error

    const databases = databasesResult.data || []
    const contacts = contactsResult.data || []
    const reminderLogs = reminderLogsResult.data || []
    const blastLogs = blastLogsResult.data || []
    const jobs = jobsResult.data || []

    const reminderSent = countStatus(reminderLogs, 'sent')
    const reminderFailed = countStatus(reminderLogs, 'failed')
    const blastSent = countStatus(blastLogs, 'sent')
    const blastFailed = countStatus(blastLogs, 'failed')

    const allJobsResult = await supabaseAdmin
      .from('send_jobs')
      .select('*')

    if (allJobsResult.error) throw allJobsResult.error

    const allJobs = allJobsResult.data || []

    const summary = {
      totalDatabases: databases.length,
      totalReminderDatabases: databases.filter((item) => item.type === 'reminder').length,
      totalBlastDatabases: databases.filter((item) => item.type === 'blast').length,

      totalContacts: contacts.length,
      totalReminderContacts: contacts.filter((item) => {
        const db = databases.find((database) => database.id === item.database_id)
        return db?.type === 'reminder'
      }).length,
      totalBlastContacts: contacts.filter((item) => {
        const db = databases.find((database) => database.id === item.database_id)
        return db?.type === 'blast'
      }).length,

      reminderSent,
      reminderFailed,
      reminderTotal: reminderLogs.length,

      blastSent,
      blastFailed,
      blastTotal: blastLogs.length,

      totalSent: reminderSent + blastSent,
      totalFailed: reminderFailed + blastFailed,
      totalLogs: reminderLogs.length + blastLogs.length,

      totalJobs: allJobs.length,
      pendingJobs: allJobs.filter((job) => job.status === 'pending').length,
      processingJobs: allJobs.filter((job) => job.status === 'processing').length,
      doneJobs: allJobs.filter((job) => job.status === 'done').length,
      failedJobs: allJobs.filter((job) => job.status === 'failed').length
    }

    return res.status(200).json({
      success: true,
      summary,
      recentJobs: jobs,
      recentReminderLogs: reminderLogs.slice(0, 5),
      recentBlastLogs: blastLogs.slice(0, 5)
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal mengambil dashboard stats'
    })
  }
}
