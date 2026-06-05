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
