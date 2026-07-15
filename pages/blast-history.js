import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'

function cleanText(value) {
  return String(value || '').trim()
}

function formatDate(value) {
  if (!value) return '-'

  try {
    return new Date(value).toLocaleString('id-ID')
  } catch (error) {
    return value
  }
}

function shortText(value, max = 120) {
  const text = cleanText(value)
  if (text.length <= max) return text
  return text.slice(0, max) + '...'
}

function statusClass(status) {
  const text = cleanText(status).toLowerCase()

  if (text === 'sent' || text === 'delivered' || text === 'read') {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-100'
  }

  if (text === 'failed') {
    return 'bg-rose-50 text-rose-700 ring-rose-100'
  }

  if (text === 'processing') {
    return 'bg-blue-50 text-blue-700 ring-blue-100'
  }

  if (text === 'pending' || text === 'queued') {
    return 'bg-amber-50 text-amber-700 ring-amber-100'
  }

  return 'bg-slate-100 text-slate-600 ring-slate-200'
}

export default function BlastHistoryPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [template, setTemplate] = useState('')
  const [page, setPage] = useState(1)
  const [pageInfo, setPageInfo] = useState({
    page: 1,
    limit: 500,
    total: 0,
    total_pages: 1,
    has_next: false,
    has_prev: false
  })

  const limit = 500

  const summary = useMemo(() => {
    const sent = rows.filter((row) => row.status === 'sent').length
    const failed = rows.filter((row) => row.status === 'failed').length
    const pending = rows.filter((row) => ['pending', 'queued'].includes(row.status)).length
    const processing = rows.filter((row) => row.status === 'processing').length

    return {
      sent,
      failed,
      pending,
      processing
    }
  }, [rows])

  async function loadRows(targetPage = page) {
    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams()
      params.set('page', String(targetPage))
      params.set('limit', String(limit))
      params.set('t', String(Date.now()))

      if (search) params.set('q', search)
      if (status !== 'all') params.set('status', status)
      if (template) params.set('template', template)

      const response = await fetch('/api/blast-history/list?' + params.toString(), {
        cache: 'no-store'
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal memuat blast history.')
      }

      setRows(data.rows || [])
      setPageInfo(data.page || {})
      setPage(targetPage)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message || 'Gagal memuat blast history.')
    } finally {
      setLoading(false)
    }
  }

  function applySearch(event) {
    event.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  function resetFilter() {
    setSearchInput('')
    setSearch('')
    setStatus('all')
    setTemplate('')
    setPage(1)
  }

  function exportCurrentPage() {
    const headers = [
      'display_time',
      'phone',
      'name',
      'template_name',
      'campaign_type',
      'project_name',
      'batch_name',
      'status',
      'failed_reason',
      'message',
      'job_name'
    ]

    const lines = [
      headers.join(',')
    ]

    for (const row of rows) {
      const line = headers.map((key) => {
        const value = String(row[key] || '').replace(/"/g, '""')
        return `"${value}"`
      })

      lines.push(line.join(','))
    }

    const blob = new Blob([lines.join('\n')], {
      type: 'text/csv;charset=utf-8'
    })

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `blast-history-page-${page}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    loadRows(1)
  }, [search, status, template])

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <Sidebar />

      <main className="min-w-0 flex-1 p-4 lg:p-8">
        <div className="mx-auto max-w-7xl space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-600">
                  WhatsApp Blast Log
                </p>
                <h1 className="mt-2 text-2xl font-black text-slate-950">
                  Blast History
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Riwayat semua pesan blast per baris, termasuk yang tidak dibalas customer.
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString('id-ID')}` : ''}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={exportCurrentPage}
                  disabled={!rows.length}
                  className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
                >
                  Export Page CSV
                </button>

                <button
                  type="button"
                  onClick={() => loadRows(page)}
                  disabled={loading}
                  className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {loading ? 'Loading...' : 'Refresh'}
                </button>
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold text-slate-500">Total Data</p>
              <p className="mt-1 text-2xl font-black text-slate-950">{pageInfo.total || 0}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold text-slate-500">Page Rows</p>
              <p className="mt-1 text-2xl font-black text-slate-950">{rows.length}</p>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
              <p className="text-xs font-bold text-emerald-700">Sent Page</p>
              <p className="mt-1 text-2xl font-black text-emerald-800">{summary.sent}</p>
            </div>

            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 shadow-sm">
              <p className="text-xs font-bold text-rose-700">Failed Page</p>
              <p className="mt-1 text-2xl font-black text-rose-800">{summary.failed}</p>
            </div>

            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 shadow-sm">
              <p className="text-xs font-bold text-amber-700">Pending Page</p>
              <p className="mt-1 text-2xl font-black text-amber-800">
                {summary.pending + summary.processing}
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <form onSubmit={applySearch} className="grid gap-3 lg:grid-cols-[1fr_180px_180px_auto_auto]">
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Cari nomor, pesan, template, status..."
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-500"
              />

              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value)
                  setPage(1)
                }}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-500"
              >
                <option value="all">Semua Status</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
              </select>

              <input
                value={template}
                onChange={(event) => {
                  setTemplate(event.target.value)
                  setPage(1)
                }}
                placeholder="Template name"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-500"
              />

              <button
                type="submit"
                className="rounded-2xl bg-cyan-600 px-5 py-3 text-sm font-black text-white hover:bg-cyan-700"
              >
                Search
              </button>

              <button
                type="button"
                onClick={resetFilter}
                className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-200"
              >
                Reset
              </button>
            </form>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-black text-slate-950">Sent Message Log</h2>
                <p className="text-xs text-slate-500">
                  Page {pageInfo.page || page} dari {pageInfo.total_pages || 1} · {pageInfo.returned || rows.length} data per halaman
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => loadRows(Math.max(1, page - 1))}
                  disabled={loading || !pageInfo.has_prev}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-40"
                >
                  Prev
                </button>

                <button
                  type="button"
                  onClick={() => loadRows(page + 1)}
                  disabled={loading || !pageInfo.has_next}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[1300px] w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Waktu</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Template / Campaign</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Reason Failed</th>
                    <th className="px-4 py-3">Message</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        Loading blast history...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        Belum ada data blast history.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-50 align-top hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500">
                          {formatDate(row.display_time)}
                        </td>

                        <td className="px-4 py-4">
                          <div className="font-bold text-slate-900">
                            {row.name || '-'}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {row.phone}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="font-bold text-slate-900">
                            {row.template_name || '-'}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {row.job_name || '-'}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {row.campaign_type ? (
                              <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700 ring-1 ring-blue-100">
                                {row.campaign_type}
                              </span>
                            ) : null}

                            {row.project_name ? (
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                                {row.project_name}
                              </span>
                            ) : null}

                            {row.batch_name ? (
                              <span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-semibold text-cyan-700">
                                {row.batch_name}
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ring-1 ${statusClass(row.status)}`}>
                            {row.status || '-'}
                          </span>
                          {row.raw_status && row.raw_status !== row.status ? (
                            <div className="mt-1 text-[10px] text-slate-400">
                              raw: {row.raw_status}
                            </div>
                          ) : null}
                        </td>

                        <td className="max-w-xs px-4 py-4 text-xs text-rose-700">
                          {row.failed_reason || '-'}
                        </td>

                        <td className="max-w-sm px-4 py-4 text-slate-700">
                          <div className="whitespace-pre-wrap">
                            {shortText(row.message, 220) || '-'}
                          </div>

                          {row.header_media_id ? (
                            <div className="mt-2 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                              Meta Media ID: {row.header_media_id}
                            </div>
                          ) : row.attachment_url ? (
                            <div className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                              URL Attachment
                            </div>
                          ) : null}
                        </td>

                        <td className="px-4 py-4">
                          <Link
                            href={`/inbox?phone=${encodeURIComponent(row.phone)}`}
                            className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700"
                          >
                            Open Inbox
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
              <p className="text-xs text-slate-500">
                Total data: {pageInfo.total || 0} · Page {pageInfo.page || page} / {pageInfo.total_pages || 1}
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => loadRows(Math.max(1, page - 1))}
                  disabled={loading || !pageInfo.has_prev}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-40"
                >
                  Prev
                </button>

                <button
                  type="button"
                  onClick={() => loadRows(page + 1)}
                  disabled={loading || !pageInfo.has_next}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}