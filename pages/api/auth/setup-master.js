import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username dan password wajib diisi'
      })
    }

    const { count, error: countError } = await supabaseAdmin
      .from('app_users')
      .select('*', { count: 'exact', head: true })

    if (countError) throw countError

    if (count > 0) {
      return res.status(400).json({
        success: false,
        message: 'Master user sudah pernah dibuat'
      })
    }

    const hash = await bcrypt.hash(password, 10)

    const { data, error } = await supabaseAdmin
      .from('app_users')
      .insert({
        username,
        password_hash: hash,
        role: 'master',
        is_active: true
      })
      .select('id, username, role, is_active, created_at')
      .single()

    if (error) throw error

    return res.status(200).json({
      success: true,
      message: 'Master user berhasil dibuat',
      data
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal setup master user'
    })
  }
}
