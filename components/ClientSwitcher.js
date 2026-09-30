import { useEffect, useState } from 'react'

export default function ClientSwitcher() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [context, setContext] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        const response = await fetch('/api/client-context', {
          method: 'GET',
          cache: 'no-store'
        })
        const data = await response.json()

        if (!response.ok || !data.success) {
          throw new Error(data.message || 'Gagal memuat client context.')
        }

        if (mounted) setContext(data)
      } catch (error) {
        if (mounted) setMessage(error.message || 'Client context error')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()

    return () => {
      mounted = false
    }
  }, [])

  async function changeClient(clientId) {
    if (!clientId || saving) return

    setSaving(true)
    setMessage('')

    try {
      const response = await fetch('/api/client-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal mengganti client.')
      }

      window.location.reload()
    } catch (error) {
      setMessage(error.message || 'Gagal mengganti client.')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="mb-5 rounded-3xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
          Client Scope
        </p>
        <p className="mt-2 text-sm font-semibold text-slate-500">Loading...</p>
      </div>
    )
  }

  if (!context?.current_client) {
    return (
      <div className="mb-5 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700">
        {message || 'Client belum terhubung.'}
      </div>
    )
  }

  const current = context.current_client
  const clients = Array.isArray(context.clients) ? context.clients : []

  return (
    <div className="mb-5 rounded-3xl border border-cyan-100 bg-cyan-50/60 p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-700">
        Client Scope
      </p>

      {context.can_switch ? (
        <select
          value={current.id}
          disabled={saving}
          onChange={(event) => changeClient(event.target.value)}
          className="mt-2 w-full rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm font-extrabold text-slate-900 outline-none"
        >
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.code} · {client.brand_name || client.name}
            </option>
          ))}
        </select>
      ) : (
        <p className="mt-2 truncate text-sm font-extrabold text-slate-900">
          {current.brand_name || current.name}
        </p>
      )}

      <p className="mt-2 text-[11px] font-semibold text-slate-500">
        {saving ? 'Switching client...' : `${current.code} · ${current.status}`}
      </p>

      {message ? (
        <p className="mt-2 text-[11px] font-semibold text-rose-600">{message}</p>
      ) : null}
    </div>
  )
}
