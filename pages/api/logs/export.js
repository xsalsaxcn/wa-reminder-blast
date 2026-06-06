import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function escapeCsv(value) {
  if (value === null || value === undefined) return ''
  const stringValue = String(value).replace(/"/g, '""')
  return `"${stringValue}"`
}

function toCsv(rows) {
  const headers = [
    'source',
    'sent_at',
    'phone',
    'status',
    'message',
    'error_message',
    'meta_message_id',
    'database_id',
    'contact_id'
  ]

  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((key) => escapeCsv(row[key])).join(',')
    )
  ]

  return lines.join('\n')
}

async function getLogsFromTable(table, source, start, end) {
  let query = supabaseAdmin
    .from(table)
    .select('*')
    .order('sent_at', { ascending: false })

  if (start) query = query.gte('sent_at', `${start}T00:00:00`)
  if (end) query = query.lte('sent_at', `${end}T23:59:59`)

  const { data, error } = await query

  if (error) throw error

  return (data || []).map((item) => ({
    source,
    sent_at: item.sent_at,
    phone: item.phone,
    status: item.status,
    message: item.message,
    error_message: item.error_message,
    meta_message_id: item.meta_message_id,
    database_id: item.database_id,
    contact_id: item.contact_id
  }))
}

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin', 'user'])
  if (!authUser) return

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const { type = 'all', start = '', end = '' } = req.query

    let rows = []

    if (type === 'reminder') {
      rows = await getLogsFromTable('reminder_logs', 'Reminder', start, end)
    } else if (type === 'blast') {
      rows = await getLogsFromTable('blast_logs', 'WhatsApp Blast', start, end)
    } else {
      const reminderRows = await getLogsFromTable('reminder_logs', 'Reminder', start, end)
      const blastRows = await getLogsFromTable('blast_logs', 'WhatsApp Blast', start, end)

      rows = [...reminderRows, ...blastRows].sort(
        (a, b) => new Date(b.sent_at) - new Date(a.sent_at)
      )
    }

    const csv = toCsv(rows)

    const filename = `wa-${type}-logs-${start || 'all'}-${end || 'all'}.csv`

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    return res.status(200).send(csv)
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Export logs gagal'
    })
  }
}
