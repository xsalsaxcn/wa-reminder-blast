import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { requireRole } from '../../../../lib/auth'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')

  try {
    const currentUser = await requireRole(req, res, ['master', 'admin'])

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const { id, is_active } = req.body || {}

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID wajib diisi'
      })
    }

    const { data: targetUser, error: targetError } = await supabaseAdmin
      .from('app_users')
      .select('id, username, role')
      .eq('id', id)
      .single()

    if (targetError || !targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User tidak ditemukan'
      })
    }

    if (targetUser.role === 'master' && currentUser?.role !== 'master') {
      return res.status(403).json({
        success: false,
        message: 'Admin tidak boleh mengubah master'
      })
    }

    if (targetUser.role === 'admin' && currentUser?.role !== 'master') {
      return res.status(403).json({
        success: false,
        message: 'Admin tidak boleh mengubah admin lain'
      })
    }

    const { data, error } = await supabaseAdmin
      .from('app_users')
      .update({
        is_active: Boolean(is_active),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('id, username, role, is_active, created_at, updated_at')
      .single()

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      })
    }

    return res.status(200).json({
      success: true,
      user: data
    })
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Unauthorized'
    })
  }
}