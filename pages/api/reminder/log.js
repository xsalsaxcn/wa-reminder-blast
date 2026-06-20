import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin', 'user', 'agent'])
  if (!authUser) return

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  }

  try {
    const { start, end } = req.query

    let query = supabaseAdmin
      .from('reminder_logs')
      .select('*')
      .order('sent_at', { ascending: false })

    if (start) query = query.gte('sent_at', start)
    if (end) query = query.lte('sent_at', end)

    const { data, error } = await query

    if (error) throw error

    return res.status(200).json({
      success: true,
      data: data || []
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal mengambil reminder log'
    })
  }
}
