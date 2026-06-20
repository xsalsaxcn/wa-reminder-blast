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
        <div className="mx-auto max-w-[1500px]">
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
                <option value="done">Done</option>
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

            <div className="max-h-[620px] overflow-y-auto">
              <table className="w-full table-fixed border-collapse">
                <colgroup>
                  <col style={{ width: '29%' }} />
                  <col style={{ width: '5.5%' }} />
                  <col style={{ width: '7.5%' }} />
                  <col style={{ width: '4.25%' }} />
                  <col style={{ width: '4.25%' }} />
                  <col style={{ width: '4.25%' }} />
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '5.5%' }} />
                  <col style={{ width: '5.5%' }} />
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '4.5%' }} />
                  <col style={{ width: '4.75%' }} />
                  <col style={{ width: '4%' }} />
                  <col style={{ width: '6%' }} />
                </colgroup>

                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <SoftTh left>Job</SoftTh>
                    <SoftTh>Type</SoftTh>
                    <SoftTh>Status</SoftTh>
                    <SoftTh>Target</SoftTh>
                    <SoftTh>Sent</SoftTh>
                    <SoftTh>Failed</SoftTh>
                    <SoftTh>Replies</SoftTh>
                    <SoftTh>Rate</SoftTh>
                    <SoftTh>Interested</SoftTh>
                    <SoftTh>Follow-up</SoftTh>
                    <SoftTh>Not Int.</SoftTh>
                    <SoftTh>Opt-out</SoftTh>
                    <SoftTh>Hot Lead</SoftTh>
                    <SoftTh>Score</SoftTh>
                    <SoftTh right>Cost</SoftTh>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan="15" className="p-4 text-sm text-slate-500">
                        Loading...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan="15" className="p-4 text-sm text-slate-500">
                        Belum ada data job performance.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-4 align-top">
                          <div className="min-w-0">
                            <div
                              className="truncate text-sm font-semibold text-slate-900"
                              title={row.job_name || '-'}
                            >
                              {row.job_name || '-'}
                            </div>

                            <div className="mt-1 truncate text-xs text-slate-400">
                              {row.created_at
                                ? new Date(row.created_at).toLocaleString('id-ID')
                                : ''}
                            </div>

                            {row.id ? (
                              <div
                                className="mt-1 truncate text-[11px] text-slate-400"
                                title={row.id}
                              >
                                {row.id}
                              </div>
                            ) : null}
                          </div>
                        </td>

                        <BodyTd>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                            {row.type}
                          </span>
                        </BodyTd>

                        <BodyTd>
                          <StatusBadge status={row.status} />
                        </BodyTd>

                        <BodyTd>{row.total_target}</BodyTd>
                        <BodyTd>{row.sent}</BodyTd>
                        <BodyTd>{row.failed}</BodyTd>

                        <BodyTd>
                          <div className="text-sm font-semibold text-slate-900">
                            {row.replies}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {row.unique_repliers} nomor
                          </div>
                        </BodyTd>

                        <BodyTd>
                          <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 ring-1 ring-blue-200">
                            {row.reply_rate}%
                          </span>
                        </BodyTd>

                        <BodyTd>{row.interested}</BodyTd>
                        <BodyTd>{row.follow_up}</BodyTd>
                        <BodyTd>{row.not_interested}</BodyTd>
                        <BodyTd>{row.opt_out}</BodyTd>

                        <BodyTd>
                          <span
                            className={
                              row.hot_lead > 0
                                ? 'rounded-full bg-green-50 px-2 py-1 text-[11px] font-bold text-green-700 ring-1 ring-green-200'
                                : 'text-sm text-slate-700'
                            }
                          >
                            {row.hot_lead}
                          </span>
                        </BodyTd>

                        <BodyTd>{row.avg_score}</BodyTd>

                        <td className="px-2 py-4 text-right align-middle text-sm text-slate-700">
                          {formatRupiah(row.estimated_cost_idr)}
                        </td>
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

function SoftTh({ children, left = false, right = false }) {
  return (
    <th
      className={`px-2 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600 ${
        left ? 'text-left pl-4' : right ? 'text-right pr-4' : 'text-center'
      }`}
    >
      {children}
    </th>
  )
}

function BodyTd({ children }) {
  return (
    <td className="px-2 py-4 text-center align-middle text-sm text-slate-700">
      {children}
    </td>
  )
}

function StatusBadge({ status }) {
  const value = String(status || '-').toLowerCase()

  const styleMap = {
    completed: 'bg-green-50 text-green-700 ring-green-200',
    done: 'bg-green-50 text-green-700 ring-green-200',
    sent: 'bg-green-50 text-green-700 ring-green-200',
    failed: 'bg-red-50 text-red-700 ring-red-200',
    pending: 'bg-yellow-50 text-yellow-700 ring-yellow-200',
    processing: 'bg-blue-50 text-blue-700 ring-blue-200'
  }

  const className = styleMap[value] || 'bg-slate-50 text-slate-700 ring-slate-200'

  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ${className}`}>
      {status || '-'}
    </span>
  )
}