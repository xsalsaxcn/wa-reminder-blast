New-Item -ItemType Directory -Force -Path "lib" | Out-Null
New-Item -ItemType Directory -Force -Path "pages\api\auth" | Out-Null
New-Item -ItemType Directory -Force -Path "pages\api\admin" | Out-Null
New-Item -ItemType Directory -Force -Path "pages\admin" | Out-Null

@'
import crypto from 'crypto'

const COOKIE_NAME = 'wa_auth_token'

function getSecret() {
  return process.env.AUTH_SECRET || 'dev_secret_change_me'
}

function base64url(input) {
  return Buffer.from(JSON.stringify(input))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function decodeBase64url(input) {
  input = input.replace(/-/g, '+').replace(/_/g, '/')
  while (input.length % 4) input += '='
  return JSON.parse(Buffer.from(input, 'base64').toString('utf8'))
}

export function signToken(payload) {
  const header = base64url({ alg: 'HS256', typ: 'JWT' })
  const body = base64url({
    ...payload,
    exp: Date.now() + 1000 * 60 * 60 * 12
  })

  const signature = crypto
    .createHmac('sha256', getSecret())
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return `${header}.${body}.${signature}`
}

export function verifyToken(token) {
  if (!token) return null

  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [header, body, signature] = parts

  const expected = crypto
    .createHmac('sha256', getSecret())
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  if (signature !== expected) return null

  const payload = decodeBase64url(body)

  if (payload.exp && Date.now() > payload.exp) {
    return null
  }

  return payload
}

export function parseCookies(req) {
  const cookieHeader = req.headers.cookie || ''
  return cookieHeader.split(';').reduce((cookies, cookie) => {
    const [name, ...rest] = cookie.trim().split('=')
    if (!name) return cookies
    cookies[name] = decodeURIComponent(rest.join('='))
    return cookies
  }, {})
}

export function getAuthUser(req) {
  const cookies = parseCookies(req)
  const token = cookies[COOKIE_NAME]
  return verifyToken(token)
}

export function setAuthCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 12}`
  )
}

export function clearAuthCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  )
}

export function requireRole(req, res, roles = []) {
  const user = getAuthUser(req)

  if (!user) {
    res.status(401).json({
      success: false,
      message: 'Unauthorized'
    })
    return null
  }

  if (roles.length > 0 && !roles.includes(user.role)) {
    res.status(403).json({
      success: false,
      message: 'Forbidden'
    })
    return null
  }

  return user
}
'@ | Set-Content -Encoding UTF8 "lib\auth.js"

@'
import bcrypt from 'bcrypt'
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
'@ | Set-Content -Encoding UTF8 "pages\api\auth\setup-master.js"

@'
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
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username dan password wajib diisi'
      })
    }

    const { data: user, error } = await supabaseAdmin
      .from('app_users')
      .select('*')
      .eq('username', username)
      .eq('is_active', true)
      .maybeSingle()

    if (error) throw error

    if (!user) {
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
'@ | Set-Content -Encoding UTF8 "pages\api\auth\login.js"

@'
import { getAuthUser } from '../../../lib/auth'

export default async function handler(req, res) {
  const user = getAuthUser(req)

  if (!user) {
    return res.status(401).json({
      success: false,
      user: null
    })
  }

  return res.status(200).json({
    success: true,
    user
  })
}
'@ | Set-Content -Encoding UTF8 "pages\api\auth\me.js"

@'
import { clearAuthCookie } from '../../../lib/auth'

export default async function handler(req, res) {
  clearAuthCookie(res)

  return res.status(200).json({
    success: true,
    message: 'Logout berhasil'
  })
}
'@ | Set-Content -Encoding UTF8 "pages\api\auth\logout.js"

@'
import bcrypt from 'bcrypt'
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
'@ | Set-Content -Encoding UTF8 "pages\api\admin\users.js"

@'
import { useState } from 'react'
import { useRouter } from 'next/router'

export default function SetupMasterPage() {
  const router = useRouter()
  const [username, setUsername] = useState('masteradmin')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function setupMaster(e) {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const res = await fetch('/api/auth/setup-master', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })

    const json = await res.json()
    setLoading(false)
    setMessage(json.message)

    if (json.success) {
      setTimeout(() => router.push('/login'), 800)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-sky-500 p-5 text-white">
          <p className="text-sm font-medium opacity-90">WA Reminder & Blast</p>
          <h1 className="mt-1 text-2xl font-bold">Setup Master User</h1>
        </div>

        <form onSubmit={setupMaster} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
            />
          </div>

          <button
            disabled={loading}
            className="w-full rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? 'Creating...' : 'Create Master User'}
          </button>

          {message && <p className="text-sm font-semibold text-slate-700">{message}</p>}
        </form>
      </div>
    </main>
  )
}
'@ | Set-Content -Encoding UTF8 "pages\setup-master.js"

@'
import { useState } from 'react'
import { useRouter } from 'next/router'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function login(e) {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })

    const json = await res.json()
    setLoading(false)

    if (!json.success) {
      setMessage(json.message || 'Login gagal')
      return
    }

    router.push('/')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-sky-500 p-5 text-white">
          <p className="text-sm font-medium opacity-90">Harmony Health</p>
          <h1 className="mt-1 text-2xl font-bold">Login</h1>
        </div>

        <form onSubmit={login} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
            />
          </div>

          <button
            disabled={loading}
            className="w-full rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>

          {message && <p className="text-sm font-semibold text-rose-700">{message}</p>}

          <button
            type="button"
            onClick={() => router.push('/setup-master')}
            className="w-full text-sm font-semibold text-indigo-600"
          >
            Setup Master User
          </button>
        </form>
      </div>
    </main>
  )
}
'@ | Set-Content -Encoding UTF8 "pages\login.js"

@'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function AppLayout({ children }) {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)

  async function checkAuth() {
    const res = await fetch('/api/auth/me')
    const json = await res.json()

    if (!json.success) {
      router.replace('/login')
      return
    }

    setUser(json.user)
    setChecking(false)
  }

  useEffect(() => {
    checkAuth()
  }, [])

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-4 text-sm font-semibold text-slate-600 shadow-sm">
          Checking session...
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar user={user} />
      <div className="min-w-0 flex-1">
        <Topbar user={user} />
        <main className="p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
'@ | Set-Content -Encoding UTF8 "components\AppLayout.js"

@'
export default function Topbar({ user }) {
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur lg:px-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">Welcome back</p>
          <h2 className="text-xl font-bold text-slate-900">{user?.username || 'User'}</h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-500 md:block">
            Role: <span className="font-bold text-indigo-600">{user?.role}</span>
          </div>

          <button
            onClick={logout}
            className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}
'@ | Set-Content -Encoding UTF8 "components\Topbar.js"

@'
import { useEffect, useState } from 'react'
import AppLayout from '../../components/AppLayout'

export default function ManageUsersPage() {
  const [users, setUsers] = useState([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('user')
  const [message, setMessage] = useState('')

  async function loadUsers() {
    const res = await fetch('/api/admin/users')
    const json = await res.json()
    setUsers(json.data || [])
  }

  async function addUser(e) {
    e.preventDefault()
    setMessage('')

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role })
    })

    const json = await res.json()
    setMessage(json.message || 'Selesai')

    if (json.success) {
      setUsername('')
      setPassword('')
      setRole('user')
      loadUsers()
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Manage Users</h1>
          <p className="mt-2 text-slate-500">Kelola user aplikasi.</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Tambah User</h2>

          <form onSubmit={addUser} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
              <option value="master">Master</option>
            </select>
            <button className="rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700">
              Tambah User
            </button>
          </form>

          {message && <p className="mt-4 text-sm font-semibold text-slate-700">{message}</p>}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Daftar User</h2>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-3">Username</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="py-3 font-semibold">{item.username}</td>
                    <td>{item.role}</td>
                    <td>{item.is_active ? 'Active' : 'Inactive'}</td>
                    <td>{new Date(item.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
'@ | Set-Content -Encoding UTF8 "pages\admin\manage-users.js"

Write-Host "Auth setup selesai."