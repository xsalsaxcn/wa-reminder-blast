import { requireRole } from '../../../lib/auth'
import { buildUsageRows } from '../../../lib/usageBuilder'

function csvEscape(value) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')

  try {
    await requireRole(req, res, ['master', 'admin', 'user'])

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const { rows } = await buildUsageRows({
      start: req.query.start || '',
      end: req.query.end || '',
      source: req.query.source || 'all',
      status: req.query.status || 'all',
      job_id: req.query.job_id || '',
      limit: 10000
    })

    const header = [
      'sent_at',
      'source',
      'job_id',
      'phone',
      'message',
      'status',
      'billing_type',
      'is_24h_window',
      'last_incoming_at',
      'estimated_cost_idr',
      'meta_message_id',
      'error_message'
    ]

    const lines = [
      header.map(csvEscape).join(','),
      ...rows.map((row) =>
        [
          row.sent_at,
          row.source_label,
          row.job_id,
          row.phone,
          row.message,
          row.status,
          row.billing_type,
          row.is_24h_window ? 'yes' : 'no',
          row.last_incoming_at,
          row.estimated_cost_idr,
          row.meta_message_id,
          row.error_message
        ].map(csvEscape).join(',')
      )
    ]

    const csv = '\ufeff' + lines.join('\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="whatsapp_usage_log.csv"')

    return res.status(200).send(csv)
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Unauthorized'
    })
  }
}