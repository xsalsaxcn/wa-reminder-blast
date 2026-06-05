import { useState } from 'react'
import AppLayout from '../../components/AppLayout'

export default function ResetDatabasePage() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function resetDatabase() {
    const confirmed = confirm(
      'Yakin ingin reset database kontak dan semua log? User dan WhatsApp settings tidak akan dihapus.'
    )

    if (!confirmed) return

    setLoading(true)
    setMessage('')

    const res = await fetch('/api/admin/reset-db', {
      method: 'POST'
    })

    const json = await res.json()
    setLoading(false)
    setMessage(json.message || 'Selesai')
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Reset Database</h1>
          <p className="mt-2 text-slate-500">
            Hapus database kontak, reminder logs, dan WhatsApp blast logs dari sistem.
          </p>
        </div>

        <div className="rounded-3xl border border-rose-200 bg-white p-6 shadow-sm">
          <div className="rounded-2xl bg-rose-50 p-5">
            <h2 className="text-xl font-bold text-rose-700">Danger Zone</h2>
            <p className="mt-2 text-sm text-rose-600">
              Tindakan ini akan menghapus semua kontak, database import, dan log pengiriman.
              Data user dan WhatsApp settings tetap aman.
            </p>
          </div>

          <button
            onClick={resetDatabase}
            disabled={loading}
            className="mt-6 rounded-2xl bg-rose-600 px-5 py-3 font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {loading ? 'Resetting...' : 'Reset Database Sekarang'}
          </button>

          {message && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
              {message}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
