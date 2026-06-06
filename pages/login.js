import { useState } from 'react'
import { useRouter } from 'next/router'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('masteradmin')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function login(e) {
    e.preventDefault()

    if (loading) return

    setLoading(true)
    setMessage('')

    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
    }, 10000)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: controller.signal
      })

      clearTimeout(timeout)

      let json

      try {
        json = await res.json()
      } catch {
        throw new Error('Server mengembalikan response tidak valid.')
      }

      if (!json.success) {
        setMessage(json.message || 'Login gagal')
        setLoading(false)
        return
      }

      setMessage('Login berhasil. Mengalihkan...')
      router.replace('/')
    } catch (error) {
      clearTimeout(timeout)

      if (error.name === 'AbortError') {
        setMessage('Login timeout. Cek koneksi Supabase / API env.')
      } else {
        setMessage(error.message || 'Login gagal')
      }

      setLoading(false)
    }
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
            <label className="block text-sm font-semibold text-slate-700">
              Username
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
            />
          </div>

          <button
            disabled={loading}
            className="w-full rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>

          {message && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
              {message}
            </div>
          )}

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