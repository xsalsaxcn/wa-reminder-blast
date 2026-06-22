import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function cleanText(value) {
  return String(value || '').trim()
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    const authUser = await requireRole(req, res, ['master', 'admin', 'user', 'agent'])
    if (!authUser) return

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const limit = Number(req.query.limit || 200)
    const jobId = cleanText(req.query.job_id || req.query.jobId)
    const status = cleanText(req.query.status)
    const phone = cleanText(req.query.phone)

    let query = supabaseAdmin
      .from('send_delivery_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Number.isFinite(limit) ? Math.min(limit, 1000) : 200)

    if (jobId) query = query.eq('job_id', jobId)
    if (status) query = query.eq('status', status)
    if (phone) query = query.ilike('phone', `%${phone}%`)

    const result = await query

    if (result.error) {
      return res.status(500).json({
        success: false,
        message: result.error.message
      })
    }

    const rows = Array.isArray(result.data) ? result.data : []

    const summary = rows.reduce(
      (acc, row) => {
        acc.total += 1

        if (row.status === 'success') acc.success += 1
        else if (row.status === 'failed') acc.failed += 1
        else if (row.status === 'skipped') acc.skipped += 1
        else acc.other += 1

        return acc
      },
      {
        total: 0,
        success: 0,
        failed: 0,
        skipped: 0,
        other: 0
      }
    )

    return res.status(200).json({
      success: true,
      rows,
      items: rows,
      data: rows,
      summary
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memuat delivery logs.'
    })
  }
}