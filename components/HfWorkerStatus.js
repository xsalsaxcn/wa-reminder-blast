import { useEffect, useMemo, useState } from 'react'

function formatAge(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value)) return '-'
  if (value < 60) return `${value} dtk lalu`

  const minutes = Math.floor(value / 60)
  if (minutes < 60) return `${minutes} mnt lalu`

  const hours = Math.floor(minutes / 60)
  return `${hours} jam lalu`
}

function formatTime(value) {
  if (!value) return '-'

  try {
    return new Date(value).toLocaleString('id-ID')
  } catch {
    return String(value)
  }
}

function stateMeta(state) {
  if (state === 'auth_required') {
    return {
      label: 'AUTH REQUIRED',
      dot: 'bg-amber-500',
      badge: 'bg-amber-50 text-amber-700 ring-amber-200',
      panel: 'border-amber-200 bg-amber-50/40',
    }
  }

  if (state === 'online') {
    return {
      label: 'ONLINE',
      dot: 'bg-emerald-500',
      badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
      panel: 'border-emerald-200 bg-emerald-50/40',
    }
  }

  if (state === 'degraded') {
    return {
      label: 'DEGRADED',
      dot: 'bg-amber-500',
      badge: 'bg-amber-50 text-amber-700 ring-amber-200',
      panel: 'border-amber-200 bg-amber-50/40',
    }
  }

  return {
    label: 'OFFLINE',
    dot: 'bg-red-500',
    badge: 'bg-red-50 text-red-700 ring-red-200',
    panel: 'border-red-200 bg-red-50/40',
  }
}

export default function HfWorkerStatus() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch('/api/hf-worker/status', {
          method: 'GET',
          cache: 'no-store',
        })
        const json = await response.json()

        if (!cancelled) {
          setData(json)
        }
      } catch (error) {
        if (!cancelled) {
          setData({
            success: false,
            state: 'offline',
            message: error?.message || 'Gagal membaca HF worker',
          })
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()
    const timer = setInterval(load, 60000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const meta = useMemo(
    () => stateMeta(data?.state),
    [data?.state]
  )

  const worker = data?.worker || {}
  const diagnostics = data?.diagnostics || {}

  return (
    <div className={`mb-4 rounded-2xl border p-4 shadow-sm ${meta.panel}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
            <h2 className="text-sm font-semibold text-slate-900">
              Hugging Face Auto Worker
            </h2>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${meta.badge}`}
            >
              {loading ? 'CHECKING' : meta.label}
            </span>
          </div>

          <p className="mt-1 text-xs text-slate-500">
            Keepalive: GitHub Actions → Notiva → HF setiap 5 menit · Status refresh berkala
          </p>
        </div>

        <div className="text-right text-xs text-slate-500">
          <div>Last run: {formatAge(worker.lastRunAgeSeconds)}</div>
          <div>
            Tick: {worker.runningTick ? 'sedang berjalan' : 'menunggu tick berikutnya'}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-white/80 p-3 ring-1 ring-slate-200">
          <div className="text-slate-500">Last Run</div>
          <div className="mt-1 font-medium text-slate-900">
            {formatTime(worker.lastRunAt)}
          </div>
        </div>

        <div className="rounded-xl bg-white/80 p-3 ring-1 ring-slate-200">
          <div className="text-slate-500">Last Finished</div>
          <div className="mt-1 font-medium text-slate-900">
            {formatTime(worker.lastFinishedAt)}
          </div>
        </div>

        <div className="rounded-xl bg-white/80 p-3 ring-1 ring-slate-200">
          <div className="text-slate-500">Next Run</div>
          <div className="mt-1 font-medium text-slate-900">
            {formatTime(worker.nextRunAt)}
          </div>
        </div>

        <div className="rounded-xl bg-white/80 p-3 ring-1 ring-slate-200">
          <div className="text-slate-500">Batch Limit</div>
          <div className="mt-1 font-medium text-slate-900">
            {worker.batchLimit ?? '-'}
          </div>
        </div>
      </div>

      {(diagnostics.processorUnauthorized ||
        diagnostics.templateManualOnly ||
        data?.message) && (
        <div className="mt-3 rounded-xl bg-white/90 p-3 text-xs text-amber-800 ring-1 ring-amber-200">
          {diagnostics.processorUnauthorized && (
            <div>⚠ process-next dari HF masih menerima 401 Unauthorized.</div>
          )}

          {diagnostics.templateManualOnly && (
            <div>
              ⚠ Template Blast HF masih manual_only / auto-run generik dinonaktifkan.
            </div>
          )}

          {data?.message && <div>⚠ {data.message}</div>}
        </div>
      )}
    </div>
  )
}
