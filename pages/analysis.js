import { useEffect, useState } from 'react'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'

export default function AnalysisPage() {
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')

  const [filters, setFilters] = useState({
    start: '',
    end: '',
    label: 'all',
    job_id: ''
  })

  function buildQuery() {
    const params = new URLSearchParams()

    if (filters.start) params.set('start', filters.start)
    if (filters.end) params.set('end', filters.end)
    if (filters.label) params.set('label', filters.label)
    if (filters.job_id) params.set('job_id', filters.job_id)

    params.set('t', Date.now())

    return params.toString()
  }

  async function loadAnalysis() {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/analysis/list?' + buildQuery(), {
        cache: 'no-store'
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal memuat analysis')
      }

      setRows(data.rows || [])
      setSummary(data.summary || null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function runAnalyze() {
    setAnalyzing(true)
    setError('')

    try {
      const response = await fetch('/api/admin/analyze-inbox?limit=1000', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal menjalankan analisis')
      }

      await loadAnalysis()
      alert(`Analisis selesai. Total dianalisis: ${data.analyzed}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  function exportCsv() {
    window.open('/api/analysis/export?' + buildQuery(), '_blank')
  }

  useEffect(() => {
    loadAnalysis()
  }, [])

  return (
    <div className="min-h-screen bg-slate-100 md:flex">
      <Sidebar />

      <main className="flex-1 p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Reply Analysis</h1>
              <p className="text-sm text-slate-500">
                Analisis otomatis minat customer dari pesan masuk WhatsApp.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={runAnalyze}
                disabled={analyzing}
                className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-slate-300"
              >
                {analyzing ? 'Analyzing...' : 'Analyze Inbox'}
              </button>

              <button
                onClick={exportCsv}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
              >
                Export CSV
              </button>

              <button
                onClick={loadAnalysis}
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

          <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-4">
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
                Label
              </label>
              <select
                value={filters.label}
                onChange={(e) => setFilters({ ...filters, label: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="all">Semua</option>
                <option value="Berminat">Berminat</option>
                <option value="Tidak berminat">Tidak berminat</option>
                <option value="Follow-up">Follow-up</option>
                <option value="Netral">Netral</option>
                <option value="Opt-out">Opt-out</option>
                <option value="Komplain">Komplain</option>
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
                placeholder="Kosongkan untuk semua"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {summary ? (
            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-7">
              <SummaryCard label="Total" value={summary.total} />
              <SummaryCard label="Berminat" value={summary.interested} />
              <SummaryCard label="Tidak Minat" value={summary.notInterested} />
              <SummaryCard label="Follow-up" value={summary.followUp} />
              <SummaryCard label="Netral" value={summary.neutral} />
              <SummaryCard label="Opt-out" value={summary.optOut} />
              <SummaryCard label="Avg Score" value={summary.avgScore} />
            </div>
          ) : null}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <h2 className="font-semibold text-slate-900">Analysis Result</h2>
              <p className="text-xs text-slate-500">
                Hasil klasifikasi otomatis dari pesan masuk.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Tanggal</Th>
                    <Th>Nama</Th>
                    <Th>Phone</Th>
                    <Th>Pesan</Th>
                    <Th>Label</Th>
                    <Th>Intent</Th>
                    <Th>Score</Th>
                    <Th>Job</Th>
                    <Th>Action</Th>
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
                        Belum ada data analysis. Klik Analyze Inbox dulu.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <Td>
                          {row.received_at
                            ? new Date(row.received_at).toLocaleString('id-ID')
                            : '-'}
                        </Td>

                        <Td>{row.profile_name || '-'}</Td>

                        <Td>{row.phone}</Td>

                        <Td>
                          <div className="max-w-xs truncate" title={row.body}>
                            {row.body || '-'}
                          </div>
                        </Td>

                        <Td>
                          <LabelBadge label={row.label} />
                        </Td>

                        <Td>{row.intent}</Td>

                        <Td>{row.score}</Td>

                        <Td>
                          <div className="max-w-[180px] truncate" title={row.source_job_id || ''}>
                            {row.source_job_id || '-'}
                          </div>
                        </Td>

                        <Td>
                          <Link
                            href={`/inbox?phone=${encodeURIComponent(row.phone)}`}
                            className="inline-flex rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                          >
                            Reply
                          </Link>
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

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
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

function LabelBadge({ label }) {
  const styleMap = {
    Berminat: 'bg-green-50 text-green-700 ring-green-200',
    'Tidak berminat': 'bg-red-50 text-red-700 ring-red-200',
    'Follow-up': 'bg-yellow-50 text-yellow-700 ring-yellow-200',
    Netral: 'bg-slate-50 text-slate-700 ring-slate-200',
    'Opt-out': 'bg-zinc-100 text-zinc-700 ring-zinc-300',
    Komplain: 'bg-orange-50 text-orange-700 ring-orange-200'
  }

  const className = styleMap[label] || styleMap.Netral

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${className}`}>
      {label}
    </span>
  )
}