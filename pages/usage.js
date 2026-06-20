import { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar'

export default function UsagePage() {
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [filters, setFilters] = useState({
    start: '',
    end: '',
    source: 'all',
    status: 'all',
    job_id: ''
  })

  function formatRupiah(value) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(Number(value || 0))
  }

  function buildQuery() {
    const params = new URLSearchParams()

    if (filters.start) params.set('start', filters.start)
    if (filters.end) params.set('end', filters.end)
    if (filters.source) params.set('source', filters.source)
    if (filters.status) params.set('status', filters.status)
    if (filters.job_id) params.set('job_id', filters.job_id)

    params.set('t', Date.now())

    return params.toString()
  }

  async function loadUsage() {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/usage/list?' + buildQuery(), {
        cache: 'no-store'
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal memuat usage log')
      }

      setRows(data.rows || [])
      setSummary(data.summary || null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function exportCsv() {
    window.open('/api/usage/export?' + buildQuery(), '_blank')
  }

  useEffect(() => {
    loadUsage()
  }, [])

  return (
    <div className="min-h-screen bg-slate-100 md:flex">
      <Sidebar />

      <main className="flex-1 p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Usage & Cost Log</h1>
              <p className="text-sm text-slate-500">
                Monitor pesan keluar, status, 24-hour window, dan estimasi biaya.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Estimasi biaya bersifat internal, bukan invoice resmi Meta.
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
                onClick={loadUsage}
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

          <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">
                Start
              </label>
              <input
                type="date"
                value={filters.start}
                onChange={(e) => setFilters({ ...filters, start: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">
                End
              </label>
              <input
                type="date"
                value={filters.end}
                onChange={(e) => setFilters({ ...filters, end: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">
                Source
              </label>
              <select
                value={filters.source}
                onChange={(e) => setFilters({ ...filters, source: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="all">Semua</option>
                <option value="inbox_reply">Inbox Reply</option>
                <option value="blast">WhatsApp Blast</option>
                <option value="reminder">Reminder</option>
                <option value="job">Semua Job Queue</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">
                Status
              </label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="all">Semua</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">
                Job ID optional
              </label>
              <input
                type="text"
                value={filters.job_id}
                onChange={(e) => setFilters({ ...filters, job_id: e.target.value })}
                placeholder="Kosongkan"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {summary ? (
            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-7">
              <SummaryCard label="Total" value={summary.total} />
              <SummaryCard label="Sent" value={summary.sent} />
              <SummaryCard label="Failed" value={summary.failed} />
              <SummaryCard label="Pending" value={summary.pending} />
              <SummaryCard label="Free 24h" value={summary.freeWindow} />
              <SummaryCard label="Outside 24h" value={summary.outsideWindow} />
              <SummaryCard label="Est. Cost" value={formatRupiah(summary.estimatedCostIdr)} small />
            </div>
          ) : null}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <h2 className="font-semibold text-slate-900">Usage Log</h2>
              <p className="text-xs text-slate-500">
                Data gabungan dari Inbox Reply dan Job Queue.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Waktu</Th>
                    <Th>Source</Th>
                    <Th>Phone</Th>
                    <Th>Message</Th>
                    <Th>Status</Th>
                    <Th>Billing</Th>
                    <Th>Last Incoming</Th>
                    <Th>Cost</Th>
                    <Th>Error</Th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan="9" className="p-4 text-slate-500">
                        Loading...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="p-4 text-slate-500">
                        Belum ada usage log.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <Td>
                          {row.sent_at
                            ? new Date(row.sent_at).toLocaleString('id-ID')
                            : '-'}
                        </Td>

                        <Td>{row.source_label}</Td>

                        <Td>{row.phone}</Td>

                        <Td>
                          <div className="max-w-xs truncate" title={row.message}>
                            {row.message || '-'}
                          </div>
                        </Td>

                        <Td>
                          <StatusBadge status={row.status} />
                        </Td>

                        <Td>
                          <div className="text-xs">
                            <div className={row.is_24h_window ? 'text-green-700' : 'text-slate-700'}>
                              {row.billing_type}
                            </div>
                          </div>
                        </Td>

                        <Td>
                          {row.last_incoming_at
                            ? new Date(row.last_incoming_at).toLocaleString('id-ID')
                            : '-'}
                        </Td>

                        <Td>{formatRupiah(row.estimated_cost_idr)}</Td>

                        <Td>
                          <div className="max-w-xs truncate text-red-600" title={row.error_message || ''}>
                            {row.error_message || '-'}
                          </div>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function SummaryCard({ label, value, small }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className={`mt-1 font-bold text-slate-900 ${small ? 'text-lg' : 'text-2xl'}`}>
        {value}
      </div>
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

function StatusBadge({ status }) {
  const styleMap = {
    sent: 'bg-green-50 text-green-700 ring-green-200',
    failed: 'bg-red-50 text-red-700 ring-red-200',
    pending: 'bg-yellow-50 text-yellow-700 ring-yellow-200',
    processing: 'bg-blue-50 text-blue-700 ring-blue-200'
  }

  const className = styleMap[status] || 'bg-slate-50 text-slate-700 ring-slate-200'

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${className}`}>
      {status || '-'}
    </span>
  )
}