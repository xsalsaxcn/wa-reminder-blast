import { requireRole } from '../../../lib/auth'
import { buildJobPerformanceRows } from '../../../lib/jobPerformanceBuilder'

function csvEscape(value) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')

  try {
    await requireRole(req, res, ['master', 'admin', 'user', 'agent'])

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const { rows } = await buildJobPerformanceRows({
      start: req.query.start || '',
      end: req.query.end || '',
      type: req.query.type || 'all',
      status: req.query.status || 'all',
      q: req.query.q || '',
      limit: 1000
    })

    const header = [
      'job_id',
      'job_name',
      'type',
      'status',
      'created_at',
      'total_target',
      'sent',
      'failed',
      'pending',
      'processing',
      'replies',
      'unique_repliers',
      'reply_rate',
      'interested',
      'not_interested',
      'follow_up',
      'neutral',
      'opt_out',
      'complaint',
      'hot_lead',
      'avg_score',
      'free_window',
      'outside_window',
      'estimated_cost_idr'
    ]

    const lines = [
      header.map(csvEscape).join(','),
      ...rows.map((row) =>
        [
          row.id,
          row.job_name,
          row.type,
          row.status,
          row.created_at,
          row.total_target,
          row.sent,
          row.failed,
          row.pending,
          row.processing,
          row.replies,
          row.unique_repliers,
          row.reply_rate,
          row.interested,
          row.not_interested,
          row.follow_up,
          row.neutral,
          row.opt_out,
          row.complaint,
          row.hot_lead,
          row.avg_score,
          row.free_window,
          row.outside_window,
          row.estimated_cost_idr
        ].map(csvEscape).join(',')
      )
    ]

    const csv = '\ufeff' + lines.join('\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="job_performance.csv"')

    return res.status(200).send(csv)
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to export job performance'
    })
  }
}