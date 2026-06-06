import bcrypt from 'bcrypt'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { signToken, setAuthCookie } from '../../../lib/auth'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const { username, password } = req.body || {}

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username dan password wajib diisi'
      })
    }

    const { data: user, error } = await supabaseAdmin
      .from('app_users')
      .select('id, username, password_hash, role, is_active')
      .eq('username', username)
      .maybeSingle()

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      })
    }

    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Username atau password salah'
      })
    }

    const valid = await bcrypt.compare(password, user.password_hash)

    if (!valid) {
      return res.status(401).json({
        success: false,
        message: 'Username atau password salah'
      })
    }

    const token = signToken({
      id: user.id,
      username: user.username,
      role: user.role
    })

    setAuthCookie(res, token)

    return res.status(200).json({
      success: true,
      message: 'Login berhasil',
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Login gagal'
    })
  }
}