import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')

  try {
    await requireRole(req, res, ['master', 'admin', 'user', 'agent'])

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const { id } = req.body || {}

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID wajib diisi'
      })
    }

    const { error } = await supabaseAdmin
      .from('quick_reply_templates')
      .delete()
      .eq('id', id)

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      })
    }

    return res.status(200).json({
      success: true
    })
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Unauthorized'
    })
  }
}