import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

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

    const q = String(req.query.q || '').trim()

    let query = supabaseAdmin
      .from('wa_blacklist')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000)

    if (q) {
      query = query.or(`phone.ilike.%${q}%,profile_name.ilike.%${q}%,reason.ilike.%${q}%`)
    }

    const { data, error } = await query

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      })
    }

    return res.status(200).json({
      success: true,
      rows: data || []
    })
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Unauthorized'
    })
  }
}