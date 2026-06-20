import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { requireRole } from '../../../../lib/auth'

function isValidRole(role) {
  return ['master', 'admin'].includes(role)
}

function canCreateRole(currentRole, targetRole) {
  if (currentRole === 'master') return true
  if (currentRole === 'admin') return ['user', 'agent'].includes(targetRole)
  return false
}

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

    const { username, password, role, is_active } = req.body || {}

    const cleanUsername = String(username || '').trim()
    const cleanPassword = String(password || '').trim()
    const cleanRole = String(role || 'agent').trim()

    if (!cleanUsername) {
      return res.status(400).json({
        success: false,
        message: 'Username wajib diisi'
      })
    }

    if (cleanPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password minimal 6 karakter'
      })
    }

    if (!isValidRole(cleanRole)) {
      return res.status(400).json({
        success: false,
        message: 'Role tidak valid'
      })
    }

    if (!canCreateRole(currentUser?.role, cleanRole)) {
      return res.status(403).json({
        success: false,
        message: 'Tidak boleh membuat role ini'
      })
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('app_users')
      .select('id')
      .eq('username', cleanUsername)
      .maybeSingle()

    if (existingError) {
      return res.status(500).json({
        success: false,
        message: existingError.message
      })
    }

    if (existing?.id) {
      return res.status(400).json({
        success: false,
        message: 'Username sudah digunakan'
      })
    }

    const { data, error } = await supabaseAdmin.rpc('create_app_user_with_password', {
      p_username: cleanUsername,
      p_password: cleanPassword,
      p_role: cleanRole,
      p_is_active: Boolean(is_active)
    })

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      })
    }

    return res.status(200).json({
      success: true,
      user: Array.isArray(data) ? data[0] : data
    })
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Unauthorized'
    })
  }
}