import { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar'

export default function JobPerformancePage() {
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [filters, setFilters] = useState({
    start: '',
    end: '',
    type: 'all',
    status: 'all',
    q: ''
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
    if (filters.type) params.set('type', filters.type)
    if (filters.status) params.set('status', filters.status)
    if (filters.q) params.set('q', filters.q)

    params.set('t', Date.now())

    return params.toString()
  }

  async function loadPerformance() {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/job-performance/list?' + buildQuery(), {
        cache: 'no-store'
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal memuat job performance')
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
    window.open('/api/job-performance/export?' + buildQuery(), '_blank')
  }

  useEffect(() => {
    loadPerformance()
  }, [])

  return (
    <div className="min-h-screen bg-slate-100 md:flex">
      <Sidebar />

      <main className="flex-1 p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Job Performance</h1>
              <p className="text-sm text-slate-500">
                Lihat performa setiap blast/reminder job berdasarkan status kirim dan reply customer.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Jalankan Reply Analysis lebih dulu supaya data reply, minat, dan hot lead terbaca.
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
                onClick={loadPerformance}
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
                Type
              </label>
              <select
                value={filters.type}
                onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="all">Semua</option>
                <option value="blast">Blast</option>
                <option value="reminder">Reminder</option>
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
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">
                Search
              </label>
              <input
                type="text"
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                placeholder="Cari job..."
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {summary ? (
            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-7">
              <SummaryCard label="Jobs" value={summary.totalJobs} />
              <SummaryCard label="Target" value={summary.totalTarget} />
              <SummaryCard label="Sent" value={summary.totalSent} />
              <SummaryCard label="Failed" value={summary.totalFailed} />
              <SummaryCard label="Replies" value={summary.totalReplies} />
              <SummaryCard label="Hot Lead" value={summary.totalHotLead} />
              <SummaryCard label="Est. Cost" value={formatRupiah(summary.estimatedCostIdr)} small />
            </div>
          ) : null}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <h2 className="font-semibold text-slate-900">Campaign / Job Result</h2>
              <p className="text-xs text-slate-500">
                Data gabungan dari Job Queue, Usage Log, dan Reply Analysis.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Job</Th>
                    <Th>Type</Th>
                    <Th>Status</Th>
                    <Th>Target</Th>
                    <Th>Sent</Th>
                    <Th>Failed</Th>
                    <Th>Replies</Th>
                    <Th>Reply Rate</Th>
                    <Th>Berminat</Th>
                    <Th>Follow-up</Th>
                    <Th>Tidak Minat</Th>
                    <Th>Opt-out</Th>
                    <Th>Hot Lead</Th>
                    <Th>Avg Score</Th>
                    <Th>Cost</Th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan="15" className="p-4 text-slate-500">
                        Loading...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan="15" className="p-4 text-slate-500">
                        Belum ada data job performance.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <Td>
  <div className="min-w-[220px]">
    <div className="font-semibold text-slate-900">
      {row.job_name || '-'}
    </div>
  </div>
</Td>

                        <Td>{row.type}</Td>

                        <Td>
                          <StatusBadge status={row.status} />
                        </Td>

                        <Td>{row.total_target}</Td>
                        <Td>{row.sent}</Td>
                        <Td>{row.failed}</Td>

                        <Td>
                          <div>{row.replies}</div>
                          <div className="text-xs text-slate-400">
                            {row.unique_repliers} nomor
                          </div>
                        </Td>

                        <Td>
                          <span className="font-semibold text-slate-900">
                            {row.reply_rate}%
                          </span>
                        </Td>

                        <Td>{row.interested}</Td>
                        <Td>{row.follow_up}</Td>
                        <Td>{row.not_interested}</Td>
                        <Td>{row.opt_out}</Td>
                        <Td>{row.hot_lead}</Td>
                        <Td>{row.avg_score}</Td>
                        <Td>{formatRupiah(row.estimated_cost_idr)}</Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            <b>Tips:</b> setelah blast berjalan, buka Reply Analysis dan klik Analyze Inbox.
            Setelah itu refresh halaman ini supaya metrik Berminat, Hot Lead, dan Reply Rate terbaru.
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
  const value = String(status || '-').toLowerCase()

  const styleMap = {
    completed: 'bg-green-50 text-green-700 ring-green-200',
    sent: 'bg-green-50 text-green-700 ring-green-200',
    failed: 'bg-red-50 text-red-700 ring-red-200',
    pending: 'bg-yellow-50 text-yellow-700 ring-yellow-200',
    processing: 'bg-blue-50 text-blue-700 ring-blue-200'
  }

  const className = styleMap[value] || 'bg-slate-50 text-slate-700 ring-slate-200'

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${className}`}>
      {status || '-'}
    </span>
  )
}