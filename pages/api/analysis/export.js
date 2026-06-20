import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

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

    const { start, end, label, job_id } = req.query

    let query = supabaseAdmin
      .from('wa_message_analysis')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(10000)

    if (start) query = query.gte('received_at', start)
    if (end) query = query.lte('received_at', end)
    if (label && label !== 'all') query = query.eq('label', label)
    if (job_id && job_id !== 'all') query = query.eq('source_job_id', job_id)

    const { data, error } = await query

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      })
    }

    const rows = data || []

    const header = [
      'received_at',
      'phone',
      'profile_name',
      'body',
      'label',
      'intent',
      'score',
      'confidence',
      'source_job_id',
      'source_job_type'
    ]

    const lines = [
      header.map(csvEscape).join(','),
      ...rows.map((row) =>
        [
          row.received_at,
          row.phone,
          row.profile_name,
          row.body,
          row.label,
          row.intent,
          row.score,
          row.confidence,
          row.source_job_id,
          row.source_job_type
        ].map(csvEscape).join(',')
      )
    ]

    const csv = '\ufeff' + lines.join('\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="reply_analysis_export.csv"')

    return res.status(200).send(csv)
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Unauthorized'
    })
  }
}