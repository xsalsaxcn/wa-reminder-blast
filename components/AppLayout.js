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
