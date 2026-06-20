import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

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

    const {
      start,
      end,
      label,
      status,
      job_id,
      limit = 300
    } = req.query

    let query = supabaseAdmin
      .from('wa_message_analysis')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(Number(limit))

    if (start) {
      query = query.gte('received_at', start)
    }

    if (end) {
      query = query.lte('received_at', end)
    }

    if (label && label !== 'all') {
      query = query.eq('label', label)
    }

    if (job_id && job_id !== 'all') {
      query = query.eq('source_job_id', job_id)
    }

    const { data, error } = await query

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      })
    }

    const rows = data || []

    const summary = {
      total: rows.length,
      interested: rows.filter((row) => row.label === 'Berminat').length,
      notInterested: rows.filter((row) => row.label === 'Tidak berminat').length,
      neutral: rows.filter((row) => row.label === 'Netral').length,
      followUp: rows.filter((row) => row.label === 'Follow-up').length,
      optOut: rows.filter((row) => row.label === 'Opt-out').length,
      complaint: rows.filter((row) => row.label === 'Komplain').length,
      avgScore:
        rows.length > 0
          ? Math.round(rows.reduce((sum, row) => sum + Number(row.score || 0), 0) / rows.length)
          : 0
    }

    return res.status(200).json({
      success: true,
      rows,
      summary
    })
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Unauthorized'
    })
  }
}