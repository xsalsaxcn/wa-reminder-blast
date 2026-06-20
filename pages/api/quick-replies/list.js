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

    const activeOnly = String(req.query.active || '') === 'true'
    const q = String(req.query.q || '').trim()

    let query = supabaseAdmin
      .from('quick_reply_templates')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true })
      .limit(1000)

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    if (q) {
      query = query.or(`label.ilike.%${q}%,question.ilike.%${q}%,answer.ilike.%${q}%,category.ilike.%${q}%`)
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