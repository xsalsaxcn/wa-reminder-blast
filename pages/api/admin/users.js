import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin'])
  if (!authUser) return

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('app_users')
        .select('id, username, role, is_active, created_at')
        .order('created_at', { ascending: false })

      if (error) throw error

      return res.status(200).json({
        success: true,
        data: data || []
      })
    }

    if (req.method === 'POST') {
      const { username, password, role } = req.body

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          message: 'Username dan password wajib diisi'
        })
      }

      const hash = await bcrypt.hash(password, 10)

      const { data, error } = await supabaseAdmin
        .from('app_users')
        .insert({
          username,
          password_hash: hash,
          role: role || 'user',
          is_active: true
        })
        .select('id, username, role, is_active, created_at')
        .single()

      if (error) throw error

      return res.status(200).json({
        success: true,
        message: 'User berhasil dibuat',
        data
      })
    }

    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memproses user'
    })
  }
}
