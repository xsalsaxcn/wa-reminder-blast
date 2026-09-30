import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'
import { requireClientContext } from '../../../lib/clientScope'

async function countEq(table, column, value) {
  const result = await supabaseAdmin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(column, value)
  if (result.error) throw result.error
  return result.count || 0
}

async function countIn(table, column, ids) {
  if (!ids.length) return 0
  const result = await supabaseAdmin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .in(column, ids)
  if (result.error) throw result.error
  return result.count || 0
}

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin'])
  if (!authUser) return

  const context = await requireClientContext(req, res, authUser)
  if (!context) return

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  }

  try {
    const dbResult = await supabaseAdmin
      .from('contact_databases')
      .select('id')
      .eq('client_id', context.clientId)
    if (dbResult.error) throw dbResult.error
    const databaseIds = (dbResult.data || []).map((row) => row.id).filter(Boolean)

    const jobResult = await supabaseAdmin
      .from('send_jobs')
      .select('id')
      .eq('client_id', context.clientId)
    if (jobResult.error) throw jobResult.error
    const jobIds = (jobResult.data || []).map((row) => row.id).filter(Boolean)

    const [contacts, reminderLogs, blastLogs, sendJobItems, users] = await Promise.all([
      countIn('contacts', 'database_id', databaseIds),
      countIn('reminder_logs', 'database_id', databaseIds),
      countIn('blast_logs', 'database_id', databaseIds),
      countIn('send_job_items', 'job_id', jobIds),
      countEq('app_users', 'client_id', context.clientId)
    ])

    return res.status(200).json({
      success: true,
      client: context.client,
      stats: {
        contactDatabases: databaseIds.length,
        contacts,
        reminderLogs,
        blastLogs,
        totalLogs: reminderLogs + blastLogs,
        sendJobs: jobIds.length,
        sendJobItems,
        users
      }
    })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Gagal mengambil database stats' })
  }
}
