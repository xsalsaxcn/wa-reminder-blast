import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'

function cleanText(value) {
  return String(value || '').trim()
}

function formatDate(value) {
  if (!value) return '-'

  try {
    const date = new Date(value)

    if (Number.isNaN(date.getTime())) return String(value)

    return date.toLocaleString('id-ID')
  } catch (err) {
    return String(value)
  }
}

function getRowMessage(row) {
  return cleanText(row.body || row.message || row.text || row.content || '')
}

function getRowLabel(row) {
  return cleanText(row.label || row.category || row.intent || row.sentiment || 'Netral')
}

function normalizeSummary(summary) {
  const safe = summary || {}

  return {
    total: safe.total || 0,
    interested: safe.interested || safe.berminat || 0,
    notInterested: safe.notInterested || safe.not_interested || safe.tidak_berminat || 0,
    followUp: safe.followUp || safe.follow_up || 0,
    neutral: safe.neutral || safe.netral || 0,
    optOut: safe.optOut || safe.opt_out || 0,
    avgScore: safe.avgScore || safe.avg_score || 0
  }
}

function getLabelParam(label) {
  const map = {
    Total: 'all',
    Berminat: 'Berminat',
    'Tidak Minat': 'Tidak berminat',
    'Follow-up': 'Follow-up',
    Netral: 'Netral',
    'Opt-out': 'Opt-out'
  }

  return map[label] || 'all'
}

export default function AnalysisPage() {
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [activeLabel, setActiveLabel] = useState('all')

  const [filters, setFilters] = useState({
    start: '',
    end: '',
    label: 'all',
    job_id: ''
  })

  function buildQuery(nextFilters = filters) {
    const params = new URLSearchParams()

    if (nextFilters.start) params.set('start', nextFilters.start)
    if (nextFilters.end) params.set('end', nextFilters.end)
    if (nextFilters.label) params.set('label', nextFilters.label)
    if (nextFilters.job_id) params.set('job_id', nextFilters.job_id)

    params.set('t', String(Date.now()))

    return params.toString()
  }

  async function loadAnalysis(nextFilters = filters) {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/analysis/list?' + buildQuery(nextFilters), {
        cache: 'no-store'
      })

      const data = await response.json().catch(function () {
        return {}
      })

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal memuat analysis')
      }

      const items = Array.isArray(data.rows)
        ? data.rows
        : Array.isArray(data.items)
          ? data.items
          : Array.isArray(data.data)
            ? data.data
            : []

      setRows(items)
      setSummary(data.summary || null)
    } catch (err) {
      setRows([])
      setSummary(null)
      setError(err.message || 'Gagal memuat analysis')
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

      const data = await response.json().catch(function () {
        return {}
      })

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal menjalankan analisis')
      }

      await loadAnalysis()

      alert('Analisis selesai. Total dianalisis: ' + String(data.analyzed || 0))
    } catch (err) {
      setError(err.message || 'Gagal menjalankan analisis')
    } finally {
      setAnalyzing(false)
    }
  }

  function exportCsv() {
    window.open('/api/analysis/export?' + buildQuery(), '_blank')
  }

  function applyLabelFilter(label) {
    const nextLabel = getLabelParam(label)
    const nextFilters = {
      ...filters,
      label: nextLabel
    }

    setActiveLabel(nextLabel)
    setFilters(nextFilters)
    loadAnalysis(nextFilters)
  }

  function clearLabelFilter() {
    const nextFilters = {
      ...filters,
      label: 'all'
    }

    setActiveLabel('all')
    setFilters(nextFilters)
    loadAnalysis(nextFilters)
  }

  useEffect(function () {
    loadAnalysis()
  }, [])

  const safeSummary = normalizeSummary(summary)

  const chartItems = useMemo(() => {
    return [
      {
        label: 'Berminat',
        value: safeSummary.interested,
        className: 'bg-green-500'
      },
      {
        label: 'Tidak Minat',
        value: safeSummary.notInterested,
        className: 'bg-red-500'
      },
      {
        label: 'Follow-up',
        value: safeSummary.followUp,
        className: 'bg-yellow-500'
      },
      {
        label: 'Netral',
        value: safeSummary.neutral,
        className: 'bg-slate-400'
      },
      {
        label: 'Opt-out',
        value: safeSummary.optOut,
        className: 'bg-zinc-700'
      }
    ]
  }, [safeSummary.interested, safeSummary.notInterested, safeSummary.followUp, safeSummary.neutral, safeSummary.optOut])

  return (
    <div className="min-h-screen bg-slate-100 md:flex">
      <Sidebar />

      <main className="flex-1 p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Reply Analysis
              </h1>
              <p className="text-sm text-slate-500">
                Analisis otomatis minat customer dari pesan masuk WhatsApp.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Mode unique contact: 1 nomor dihitung 1 status final berdasarkan pesan terbaru.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={runAnalyze}
                disabled={analyzing}
                className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-slate-300"
              >
                {analyzing ? 'Analyzing...' : 'Analyze Inbox'}
              </button>

              <button
                type="button"
                onClick={exportCsv}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
              >
                Export CSV
              </button>

              <button
                type="button"
                onClick={() => loadAnalysis()}
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
                onChange={function (e) {
                  setFilters({
                    ...filters,
                    start: e.target.value
                  })
                }}
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
                onChange={function (e) {
                  setFilters({
                    ...filters,
                    end: e.target.value
                  })
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">
                Label
              </label>
              <select
                value={filters.label}
                onChange={function (e) {
                  const nextFilters = {
                    ...filters,
                    label: e.target.value
                  }

                  setFilters(nextFilters)
                  setActiveLabel(e.target.value)
                  loadAnalysis(nextFilters)
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="all">Semua</option>
                <option value="Berminat">Berminat</option>
                <option value="Tidak berminat">Tidak Minat</option>
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
                onChange={function (e) {
                  setFilters({
                    ...filters,
                    job_id: e.target.value
                  })
                }}
                placeholder="Kosongkan untuk semua"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-7">
            <SummaryCard label="Total" value={safeSummary.total} active={activeLabel === 'all'} onClick={() => applyLabelFilter('Total')} />
            <SummaryCard label="Berminat" value={safeSummary.interested} active={activeLabel === 'Berminat'} onClick={() => applyLabelFilter('Berminat')} />
            <SummaryCard label="Tidak Minat" value={safeSummary.notInterested} active={activeLabel === 'Tidak berminat'} onClick={() => applyLabelFilter('Tidak Minat')} />
            <SummaryCard label="Follow-up" value={safeSummary.followUp} active={activeLabel === 'Follow-up'} onClick={() => applyLabelFilter('Follow-up')} />
            <SummaryCard label="Netral" value={safeSummary.neutral} active={activeLabel === 'Netral'} onClick={() => applyLabelFilter('Netral')} />
            <SummaryCard label="Opt-out" value={safeSummary.optOut} active={activeLabel === 'Opt-out'} onClick={() => applyLabelFilter('Opt-out')} />
            <SummaryCard label="Avg Score" value={safeSummary.avgScore} />
          </div>

          <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">
                  Grafik Status Kontak
                </h2>
                <p className="text-xs text-slate-500">
                  Grafik berdasarkan kontak unik, bukan jumlah pesan.
                </p>
              </div>

              {activeLabel !== 'all' ? (
                <button
                  type="button"
                  onClick={clearLabelFilter}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                >
                  Reset Filter
                </button>
              ) : null}
            </div>

            <div className="space-y-3">
              {chartItems.map((item) => (
                <ChartBar
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  total={safeSummary.total}
                  className={item.className}
                  onClick={() => applyLabelFilter(item.label)}
                />
              ))}
            </div>
          </div>

          {activeLabel !== 'all' ? (
            <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
              Menampilkan kontak unik dengan status: <b>{activeLabel}</b>. Klik Reset Filter untuk kembali melihat semua.
            </div>
          ) : null}

          <div className="space-y-3 md:hidden">
            {loading ? (
              <div className="rounded-2xl bg-white p-4 text-sm text-slate-500">
                Loading...
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-2xl bg-white p-4 text-sm text-slate-500">
                Belum ada data analysis. Klik Analyze Inbox dulu.
              </div>
            ) : (
              rows.map(function (row) {
                return (
                  <MobileAnalysisCard key={row.id} row={row} />
                )
              })
            )}
          </div>

          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
            <div className="border-b border-slate-200 p-4">
              <h2 className="font-semibold text-slate-900">
                Analysis Result
              </h2>
              <p className="text-xs text-slate-500">
                Hasil akhir per kontak unik. Jika customer berubah dari berminat menjadi tidak minat, status final mengikuti pesan terbaru.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Tanggal Terakhir</Th>
                    <Th>Nama</Th>
                    <Th>Phone</Th>
                    <Th>Pesan Terakhir</Th>
                    <Th>Label Final</Th>
                    <Th>Intent</Th>
                    <Th>Score</Th>
                    <Th>Jumlah Chat</Th>
                    <Th>Job</Th>
                    <Th>Action</Th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan="10" className="p-4 text-slate-500">
                        Loading...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="p-4 text-slate-500">
                        Belum ada data analysis. Klik Analyze Inbox dulu.
                      </td>
                    </tr>
                  ) : (
                    rows.map(function (row) {
                      return (
                        <tr key={row.id} className="hover:bg-slate-50">
                          <Td>{formatDate(row.received_at)}</Td>

                          <Td>{row.profile_name || '-'}</Td>

                          <Td>{row.phone || '-'}</Td>

                          <Td>
                            <div
                              className="max-w-xs truncate"
                              title={getRowMessage(row)}
                            >
                              {getRowMessage(row) || '-'}
                            </div>
                          </Td>

                          <Td>
                            <LabelBadge label={getRowLabel(row)} />
                          </Td>

                          <Td>{row.intent || '-'}</Td>

                          <Td>{row.score ?? '-'}</Td>

                          <Td>{row.analysis_count || 1}</Td>

                          <Td>
                            <div
                              className="max-w-[180px] truncate"
                              title={row.source_job_id || row.job_id || ''}
                            >
                              {row.source_job_id || row.job_id || '-'}
                            </div>
                          </Td>

                          <Td>
                            <Link
                              href={{
                                pathname: '/inbox',
                                query: {
                                  phone: row.phone || ''
                                }
                              }}
                              className="inline-flex rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                            >
                              Reply / FU
                            </Link>
                          </Td>
                        </tr>
                      )
                    })
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

function ChartBar({ label, value, total, className, onClick }) {
  const percent = total > 0 ? Math.round((Number(value || 0) / total) * 100) : 0

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-xl p-2 text-left hover:bg-slate-50"
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-700">
          {label}
        </span>
        <span className="text-xs font-bold text-slate-500">
          {value} kontak · {percent}%
        </span>
      </div>

      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div
          className={'h-full rounded-full ' + className}
          style={{
            width: `${percent}%`
          }}
        />
      </div>
    </button>
  )
}

function MobileAnalysisCard({ row }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-bold text-slate-900">
            {row.profile_name || '-'}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {row.phone || '-'}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {formatDate(row.received_at)}
          </div>
        </div>

        <LabelBadge label={getRowLabel(row)} />
      </div>

      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
        {getRowMessage(row) || '-'}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl bg-slate-50 p-2">
          <div className="font-semibold text-slate-400">
            Intent
          </div>
          <div className="mt-1 font-bold text-slate-700">
            {row.intent || '-'}
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 p-2">
          <div className="font-semibold text-slate-400">
            Score
          </div>
          <div className="mt-1 font-bold text-slate-700">
            {row.score ?? '-'}
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 p-2">
          <div className="font-semibold text-slate-400">
            Chat
          </div>
          <div className="mt-1 font-bold text-slate-700">
            {row.analysis_count || 1}
          </div>
        </div>
      </div>

      <Link
        href={{
          pathname: '/inbox',
          query: {
            phone: row.phone || ''
          }
        }}
        className="mt-3 inline-flex rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white"
      >
        Reply / FU
      </Link>
    </div>
  )
}

function SummaryCard({ label, value, active, onClick }) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
          active
            ? 'border-blue-300 bg-blue-50'
            : 'border-slate-200 bg-white hover:bg-slate-50'
        }`}
      >
        <div className="text-xs font-semibold text-slate-500">
          {label}
        </div>
        <div className="mt-1 text-2xl font-bold text-slate-900">
          {value}
        </div>
        <div className="mt-1 text-[11px] font-semibold text-blue-600">
          Klik detail
        </div>
      </button>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-slate-900">
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
  return (
    <td className="px-4 py-3 text-slate-700">
      {children}
    </td>
  )
}

function LabelBadge({ label }) {
  const finalLabel = label || 'Netral'

  const styleMap = {
    Berminat: 'bg-green-50 text-green-700 ring-green-200',
    'Tidak berminat': 'bg-red-50 text-red-700 ring-red-200',
    'Tidak Berminat': 'bg-red-50 text-red-700 ring-red-200',
    'Follow-up': 'bg-yellow-50 text-yellow-700 ring-yellow-200',
    'Follow Up': 'bg-yellow-50 text-yellow-700 ring-yellow-200',
    Netral: 'bg-slate-50 text-slate-700 ring-slate-200',
    'Opt-out': 'bg-zinc-100 text-zinc-700 ring-zinc-300',
    Komplain: 'bg-orange-50 text-orange-700 ring-orange-200'
  }

  const className = styleMap[finalLabel] || styleMap.Netral

  return (
    <span className={'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ' + className}>
      {finalLabel}
    </span>
  )
}