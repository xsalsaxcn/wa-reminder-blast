import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function SchedulerRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/admin/auto-worker')
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="rounded-3xl border border-slate-200 bg-white px-6 py-4 text-sm font-semibold text-slate-600 shadow-sm">
        Redirecting to Auto Worker...
      </div>
    </main>
  )
}
