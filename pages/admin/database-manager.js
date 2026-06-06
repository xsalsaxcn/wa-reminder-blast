import { useEffect, useState } from 'react'
import AppLayout from '../../components/AppLayout'

function StatBox({ title, value, tone = 'slate' }) {
  const toneClass = {
    slate: 'border-slate-200 bg-white text-slate-900',
    indigo: 'border-indigo-100 bg-indigo-50 text-indigo-700',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    rose: 'border-rose-100 bg-rose-50 text-rose-700',
    sky: 'border-sky-100 bg-sky-50 text-sky-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700'
  }

  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${toneClass[tone] || toneClass.slate}`}>
      <p className="text-sm font-semibold opacity-75">{title}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  )
}

export default function DatabaseManagerPage() {
  const [stats, setStats] = useState(null)
  const [databases, setDatabases] = useState([])
  const [selectedDatabaseId, setSelectedDatabaseId] = useState('')
  const [contacts, setContacts] = useState([])
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [logRetentionDays, setLogRetentionDays] = useState(90)
  const [jobRetentionDays, setJobRetentionDays] = useState(30)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function loadStats() {
    const res = await fetch('/api/databases/stats')
    const json = await res.json()
    if (json.success) setStats(json.stats)
  }

  async function loadDatabases() {
    const res = await fetch('/api/databases/list')
    const json = await res.json()
    if (json.success) setDatabases(json.data || [])
  }

  async function loadContacts(nextPage = page) {
    if (!selectedDatabaseId) {
      setContacts([])
      setPagination(null)
      return
    }

    const res = await fetch(`/api/databases/contacts?databaseId=${selectedDatabaseId}&page=${nextPage}&pageSize=25`)
    const json = await res.json()

    if (json.success) {
      setContacts(json.data || [])
      setPagination(json.pagination)
      setPage(nextPage)
    }
  }

  async function deleteDatabase(databaseId) {
    const db = databases.find((item) => item.id === databaseId)

    if (!db) return

    const confirmed = confirm(
      `Yakin hapus database "${db.name}"? Contacts dan jobs terkait akan terhapus. Logs audit tetap disimpan.`
    )

    if (!confirmed) return

    setLoading(true)
    setMessage('')

    const res = await fetch('/api/databases/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ databaseId })
    })

    const json = await res.json()

    setLoading(false)
    setMessage(json.message || 'Selesai')

    if (json.success) {
      setSelectedDatabaseId('')
      setContacts([])
      await loadDatabases()
      await loadStats()
    }
  }

  async function runCleanup() {
    const confirmed = confirm(
      `Jalankan cleanup? Logs lebih lama dari ${logRetentionDays} hari dan jobs selesai lebih lama dari ${jobRetentionDays} hari akan dihapus.`
    )

    if (!confirmed) return

    setLoading(true)
    setMessage('')

    const res = await fetch('/api/admin/cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logRetentionDays, jobRetentionDays })
    })

    const json = await res.json()

    setLoading(false)
    setMessage(json.message || 'Selesai')
    await loadStats()
  }

  useEffect(() => {
    loadStats()
    loadDatabases()
  }, [])

  useEffect(() => {
    if (selectedDatabaseId) {
      loadContacts(1)
    }
  }, [selectedDatabaseId])

  const safeStats = stats || {
    contactDatabases: 0,
    contacts: 0,
    reminderLogs: 0,
    blastLogs: 0,
    totalLogs: 0,
    sendJobs: 0,
    sendJobItems: 0,
    users: 0
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Database Manager</h1>
          <p className="mt-2 text-slate-500">
            Pantau ukuran data, hapus database import tertentu, dan bersihkan logs/jobs lama supaya Supabase tetap ringan.
          </p>
        </div>

        {message && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 shadow-sm">
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          <StatBox title="Databases" value={safeStats.contactDatabases} tone="indigo" />
          <StatBox title="Contacts" value={safeStats.contacts} tone="sky" />
          <StatBox title="Logs" value={safeStats.totalLogs} tone="emerald" />
          <StatBox title="Job Items" value={safeStats.sendJobItems} tone="amber" />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">Cleanup Old Data</h2>
            <p className="mt-2 text-sm text-slate-500">
              Cleanup tidak menghapus users, settings, atau Meta API config. Hanya logs lama dan jobs selesai yang sudah melewati retention.
            </p>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700">Log Retention Days</label>
                <input
                  type="number"
                  value={logRetentionDays}
                  onChange={(e) => setLogRetentionDays(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700">Job Retention Days</label>
                <input
                  type="number"
                  value={jobRetentionDays}
                  onChange={(e) => setJobRetentionDays(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3"
                />
              </div>

              <button
                onClick={runCleanup}
                disabled={loading}
                className="mt-7 rounded-2xl bg-rose-600 px-5 py-3 font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {loading ? 'Cleaning...' : 'Run Cleanup'}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">Storage Safety Rules</h2>
            <div className="mt-5 space-y-3 text-sm text-slate-600">
              <div className="rounded-2xl bg-slate-50 p-4">
                Import dibatasi oleh <b>MAX_IMPORT_CONTACTS</b>, default 5000 kontak per upload.
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                Nomor duplikat dalam satu file otomatis dilewati.
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                Delete database akan menghapus contacts dan jobs terkait, tapi logs audit tetap disimpan sampai cleanup.
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Imported Databases</h2>
              <p className="mt-1 text-sm text-slate-500">Pilih database untuk preview kontak atau hapus database tertentu.</p>
            </div>

            <button
              onClick={() => {
                loadDatabases()
                loadStats()
              }}
              className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-3">Name</th>
                  <th>Type</th>
                  <th>Total</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {databases.map((db) => (
                  <tr key={db.id} className="border-t border-slate-100">
                    <td className="py-3 font-semibold text-slate-900">{db.name}</td>
                    <td>{db.type}</td>
                    <td>{db.total_contacts}</td>
                    <td>{new Date(db.created_at).toLocaleString()}</td>
                    <td className="space-x-2">
                      <button
                        onClick={() => setSelectedDatabaseId(db.id)}
                        className="rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => deleteDatabase(db.id)}
                        disabled={loading}
                        className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}

                {databases.length === 0 && (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-slate-400">
                      Belum ada database
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {selectedDatabaseId && (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-slate-900">Contact Preview</h2>
              {pagination && (
                <p className="text-sm text-slate-500">
                  Page {pagination.page} of {pagination.totalPages} â€” Total {pagination.total}
                </p>
              )}
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-3">Name</th>
                    <th>Phone</th>
                    <th>Reminder Date</th>
                    <th>Reminder Time</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    <tr key={contact.id} className="border-t border-slate-100">
                      <td className="py-3">{contact.name || '-'}</td>
                      <td>{contact.phone}</td>
                      <td>{contact.reminder_date || '-'}</td>
                      <td>{contact.reminder_time || '-'}</td>
                      <td className="max-w-md truncate">{contact.message || '-'}</td>
                    </tr>
                  ))}

                  {contacts.length === 0 && (
                    <tr>
                      <td colSpan="5" className="py-6 text-center text-slate-400">
                        Tidak ada kontak
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => loadContacts(Math.max(page - 1, 1))}
                  disabled={page <= 1}
                  className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => loadContacts(Math.min(page + 1, pagination.totalPages))}
                  disabled={page >= pagination.totalPages}
                  className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
