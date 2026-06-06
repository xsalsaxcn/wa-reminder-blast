import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

async function countTable(table) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select('*', { count: 'exact', head: true })

  if (error) throw error

  return count || 0
}

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin'])
  if (!authUser) return

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const [
      contactDatabases,
      contacts,
      reminderLogs,
      blastLogs,
      sendJobs,
      sendJobItems,
      users
    ] = await Promise.all([
      countTable('contact_databases'),
      countTable('contacts'),
      countTable('reminder_logs'),
      countTable('blast_logs'),
      countTable('send_jobs'),
      countTable('send_job_items'),
      countTable('app_users')
    ])

    return res.status(200).json({
      success: true,
      stats: {
        contactDatabases,
        contacts,
        reminderLogs,
        blastLogs,
        totalLogs: reminderLogs + blastLogs,
        sendJobs,
        sendJobItems,
        users
      }
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal mengambil database stats'
    })
  }
}
