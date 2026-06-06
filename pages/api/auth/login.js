import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { signToken, setAuthCookie } from '../../../lib/auth'

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

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
        message: `Supabase error: ${error.message}`
      })
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Username atau password salah'
      })
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'User tidak aktif'
      })
    }

    const valid = await bcrypt.compare(password, user.password_hash)

    if (!valid) {
      return res.status(401).json({
        success: false,
        message: 'Username atau password salah'
      })
    }

    let token

    try {
      token = signToken({
        id: user.id,
        username: user.username,
        role: user.role
      })
    } catch (tokenError) {
      console.error('TOKEN_ERROR:', tokenError)

      return res.status(500).json({
        success: false,
        message: `Token error: ${tokenError.message}`
      })
    }

    try {
      setAuthCookie(res, token)
    } catch (cookieError) {
      console.error('COOKIE_ERROR:', cookieError)

      return res.status(500).json({
        success: false,
        message: `Cookie error: ${cookieError.message}`
      })
    }

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
    console.error('LOGIN_ERROR:', error)

    return res.status(500).json({
      success: false,
      message: error.message || 'Login gagal'
    })
  }
}