import { useState } from 'react'
import { useRouter } from 'next/router'

export default function SetupMasterPage() {
  const router = useRouter()
  const [username, setUsername] = useState('masteradmin')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function setupMaster(e) {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    setSuccess(false)

    const res = await fetch('/api/auth/setup-master', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })

    const json = await res.json()
    setLoading(false)
    setMessage(json.message || '')

    if (json.success) {
      setSuccess(true)
      setTimeout(() => {
        router.replace('/login')
      }, 1000)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-sky-500 p-5 text-white">
          <p className="text-sm font-medium opacity-90">WA Reminder & Blast</p>
          <h1 className="mt-1 text-2xl font-bold">Setup Master User</h1>
        </div>

        {success ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <h2 className="font-bold text-emerald-800">Master user berhasil dibuat.</h2>
            <p className="mt-2 text-sm text-emerald-700">
              Kamu akan diarahkan ke halaman login.
            </p>

            <button
              onClick={() => router.replace('/login')}
              className="mt-5 w-full rounded-2xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700"
            >
              Masuk ke Login
            </button>
          </div>
        ) : (
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

            {message && (
              <p className="text-sm font-semibold text-slate-700">{message}</p>
            )}

            <button
              type="button"
              onClick={() => router.replace('/login')}
              className="w-full text-sm font-semibold text-indigo-600"
            >
              Sudah punya akun? Login
            </button>
          </form>
        )}
      </div>
    </main>
  )
}