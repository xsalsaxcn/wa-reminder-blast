import { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar'

export default function BlacklistPage() {
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    phone: '',
    profile_name: '',
    reason: ''
  })

  async function loadBlacklist() {
    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      params.set('t', Date.now())

      const response = await fetch('/api/blacklist/list?' + params.toString(), {
        cache: 'no-store'
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal memuat blacklist')
      }

      setRows(data.rows || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function addBlacklist(e) {
    e.preventDefault()

    if (!form.phone.trim()) {
      setError('Nomor WhatsApp wajib diisi')
      return
    }

    setSaving(true)
    setError('')

    try {
      const response = await fetch('/api/blacklist/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone: form.phone,
          profile_name: form.profile_name,
          reason: form.reason || 'Manual blacklist',
          source: 'manual'
        })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal menambahkan blacklist')
      }

      setForm({
        phone: '',
        profile_name: '',
        reason: ''
      })

      await loadBlacklist()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function removeBlacklist(phone) {
    const ok = window.confirm(`Hapus ${phone} dari blacklist?`)
    if (!ok) return

    setError('')

    try {
      const response = await fetch('/api/blacklist/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ phone })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal menghapus blacklist')
      }

      await loadBlacklist()
    } catch (err) {
      setError(err.message)
    }
  }

  function exportCsv() {
    window.open('/api/blacklist/export?t=' + Date.now(), '_blank')
  }

  useEffect(() => {
    loadBlacklist()
  }, [])

  return (
    <div className="min-h-screen bg-slate-100 md:flex">
      <Sidebar />

      <main className="flex-1 p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Opt-out / Blacklist</h1>
              <p className="text-sm text-slate-500">
                Kelola nomor yang tidak boleh dikirimi WhatsApp Blast.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={exportCsv}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
              >
                Export CSV
              </button>

              <button
                onClick={loadBlacklist}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Refresh
              </button>
            </div>
          </div>

          {error ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <form
              onSubmit={addBlacklist}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-1"
            >
              <h2 className="font-semibold text-slate-900">Tambah Blacklist</h2>
              <p className="mt-1 text-xs text-slate-500">
                Nomor di sini akan dikecualikan dari export kontak blast.
              </p>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="628xxxxxxxxxx"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
                    Nama
                  </label>
                  <input
                    type="text"
                    value={form.profile_name}
                    onChange={(e) => setForm({ ...form, profile_name: e.target.value })}
                    placeholder="Nama kontak"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
                    Alasan
                  </label>
                  <textarea
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    placeholder="Contoh: Customer minta jangan dikirim lagi"
                    rows={3}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:bg-slate-300"
                >
                  {saving ? 'Saving...' : 'Add to Blacklist'}
                </button>
              </div>
            </form>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">Blacklist List</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Total: {rows.length}
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Cari phone/nama/alasan"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm md:w-72"
                  />

                  <button
                    onClick={loadBlacklist}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                  >
                    Search
                  </button>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>Phone</Th>
                      <Th>Nama</Th>
                      <Th>Alasan</Th>
                      <Th>Source</Th>
                      <Th>Tanggal</Th>
                      <Th>Action</Th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {loading ? (
                      <tr>
                        <td colSpan="6" className="p-4 text-slate-500">
                          Loading...
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="p-4 text-slate-500">
                          Belum ada blacklist.
                        </td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50">
                          <Td>{row.phone}</Td>
                          <Td>{row.profile_name || '-'}</Td>
                          <Td>
                            <div className="max-w-xs truncate" title={row.reason || ''}>
                              {row.reason || '-'}
                            </div>
                          </Td>
                          <Td>{row.source || '-'}</Td>
                          <Td>
                            {row.created_at
                              ? new Date(row.created_at).toLocaleString('id-ID')
                              : '-'}
                          </Td>
                          <Td>
                            <button
                              onClick={() => removeBlacklist(row.phone)}
                              className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                            >
                              Remove
                            </button>
                          </Td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            <b>Catatan:</b> blacklist membantu mencegah pengiriman ke nomor yang sudah opt-out.
            Tetap pastikan campaign WhatsApp mengikuti aturan consent dan template Meta.
          </div>
        </div>
      </main>
    </div>
  )
}

function Th({ children }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </th>
  )
}

function Td({ children }) {
  return <td className="px-4 py-3 text-slate-700">{children}</td>
}