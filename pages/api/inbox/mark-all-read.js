import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    const authUser = await requireRole(req, res, ['master', 'admin', 'user', 'agent'])
    if (!authUser) return

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const now = new Date().toISOString()

    const result = await supabaseAdmin
      .from('wa_conversations')
      .update({
        unread_count: 0,
        updated_at: now
      })
      .gt('unread_count', 0)
      .select('id')

    if (result.error) {
      return res.status(500).json({
        success: false,
        message: result.error.message
      })
    }

    return res.status(200).json({
      success: true,
      updated_count: Array.isArray(result.data) ? result.data.length : 0
    })
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Unauthorized'
    })
  }
}