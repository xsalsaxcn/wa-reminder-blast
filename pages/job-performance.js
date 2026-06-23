import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'

function cleanText(value) {
  return String(value || '').trim()
}

function toNumber(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return number
}

function formatDate(value) {
  if (!value) return '-'

  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)

    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (err) {
    return String(value)
  }
}

function formatRupiah(value) {
  return 'Rp ' + toNumber(value).toLocaleString('id-ID')
}

function getFirst(row, keys, fallback) {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key]
    }
  }

  return fallback
}

function normalizeRow(row) {
  const target = toNumber(getFirst(row, ['target', 'total', 'total_items', 'total_contacts'], 0))
  const sent = toNumber(getFirst(row, ['sent', 'sent_items', 'sent_count'], 0))
  const failed = toNumber(getFirst(row, ['failed', 'failed_items', 'failed_count'], 0))
  const replies = toNumber(getFirst(row, ['replies', 'reply_count', 'total_replies'], 0))

  const interested = toNumber(
    getFirst(row, ['interested', 'interested_count', 'positive', 'positive_count'], 0)
  )

  const followUp = toNumber(
    getFirst(row, ['follow_up', 'followup', 'follow_up_count'], 0)
  )

  const notInterested = toNumber(
    getFirst(row, ['not_interested', 'notInterested', 'not_interested_count', 'negative', 'negative_count'], 0)
  )

  const optOut = toNumber(
    getFirst(row, ['opt_out', 'optout', 'opt_out_count'], 0)
  )

  const hotLead = toNumber(
    getFirst(row, ['hot_lead', 'hotLead', 'hot_lead_count'], 0)
  )

  const noResponse = toNumber(
    getFirst(row, ['no_response', 'no_response_count', 'noResponse'], Math.max(0, sent - replies))
  )

  const score = toNumber(getFirst(row, ['score', 'lead_score'], 0))
  const cost = toNumber(getFirst(row, ['cost', 'estimated_cost', 'est_cost'], 0))
  const replyRate = toNumber(
    getFirst(row, ['reply_rate', 'replyRate'], sent > 0 ? Math.round((replies / sent) * 100) : 0)
  )
  const interestRate = toNumber(
    getFirst(row, ['interest_rate', 'interestRate', 'rate'], sent > 0 ? Math.round((interested / sent) * 100) : 0)
  )

  return {
    raw: row,
    id: getFirst(row, ['job_id', 'id', 'jobId'], ''),
    jobName: getFirst(row, ['job_name', 'name', 'title', 'database_name', 'campaign_name'], 'Campaign'),
    databaseName: getFirst(row, ['database_name', 'databaseName'], ''),
    type: getFirst(row, ['type', 'job_type'], '-'),
    status: getFirst(row, ['status', 'job_status'], '-'),
    createdAt: getFirst(row, ['created_at', 'createdAt', 'started_at'], ''),
    target,
    sent,
    failed,
    replies,
    noResponse,
    interested,
    followUp,
    notInterested,
    optOut,
    hotLead,
    score,
    cost,
    replyRate,
    interestRate,
    rate: interestRate
  }
}

function statusClass(status) {
  const text = cleanText(status).toLowerCase()

  if (text.includes('done') || text.includes('complete') || text.includes('sent')) {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  }

  if (text.includes('fail') || text.includes('error')) {
    return 'bg-red-50 text-red-700 ring-red-200'
  }

  if (text.includes('process') || text.includes('running')) {
    return 'bg-blue-50 text-blue-700 ring-blue-200'
  }

  return 'bg-slate-50 text-slate-700 ring-slate-200'
}

function typeClass(type) {
  const text = cleanText(type).toLowerCase()

  if (text.includes('reminder')) {
    return 'bg-violet-50 text-violet-700 ring-violet-200'
  }

  if (text.includes('blast')) {
    return 'bg-cyan-50 text-cyan-700 ring-cyan-200'
  }

  return 'bg-slate-50 text-slate-700 ring-slate-200'
}

function bucketLabel(bucket) {
  const map = {
    target: 'Target',
    sent: 'Sent',
    failed: 'Failed',
    replies: 'Replies',
    no_response: 'No Response',
    interested: 'Interested',
    follow_up: 'Follow-up',
    not_interested: 'Not Interested',
    opt_out: 'Opt-out',
    hot_lead: 'Hot Lead',
    score: 'Score Detail',
    none: 'No Reply',
    neutral: 'Neutral'
  }

  return map[bucket] || bucket
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
      {hint ? (
        <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
      ) : null}
    </div>
  )
}

function MiniStat({ label, value, className, onClick }) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-2xl bg-slate-50 p-3 text-left transition hover:-translate-y-0.5 hover:bg-blue-50 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        title={`Klik untuk lihat detail ${label}`}
      >
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
          {label}
        </p>
        <p className={'mt-1 text-lg font-black ' + (className || 'text-slate-900')}>
          {value}
        </p>
        <p className="mt-1 text-[10px] font-semibold text-blue-500">
          Klik detail
        </p>
      </button>
    )
  }

  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className={'mt-1 text-lg font-black ' + (className || 'text-slate-900')}>
        {value}
      </p>
    </div>
  )
}

function DetailPanel({ detail, loading, error, onClose }) {
  if (!detail) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 p-3 backdrop-blur-sm md:items-center md:justify-center">
      <div className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-600">
              {bucketLabel(detail.bucket)}
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-900">
              {detail.jobName}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Job ID: {detail.jobId}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200"
          >
            Tutup
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto p-5">
          {loading ? (
            <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
              Loading detail...
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {!loading && !error && !detail.rows.length ? (
            <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
              Tidak ada kontak untuk kategori ini.
            </div>
          ) : null}

          {!loading && !error && detail.rows.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-3">Kontak</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Reply / Message</th>
                    <th className="px-3 py-3">Kategori</th>
                    <th className="px-3 py-3">Waktu</th>
                    <th className="px-3 py-3">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {detail.rows.map((row) => (
                    <tr key={row.phone} className="border-b border-slate-100">
                      <td className="px-3 py-4">
                        <p className="font-bold text-slate-900">{row.name || row.phone}</p>
                        <p className="text-xs text-slate-500">{row.phone}</p>
                      </td>

                      <td className="px-3 py-4">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                          {row.status || '-'}
                        </span>
                      </td>

                      <td className="max-w-md px-3 py-4 text-slate-700">
                        {row.lastReply || row.lastMessage || '-'}
                      </td>

                      <td className="px-3 py-4">
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                          {bucketLabel(row.replyBucket || 'none')}
                        </span>
                      </td>

                      <td className="px-3 py-4 text-xs text-slate-500">
                        {formatDate(row.lastReplyAt || row.processedAt)}
                      </td>

                      <td className="px-3 py-4">
                        <Link
                          href={`/inbox?phone=${encodeURIComponent(row.phone)}`}
                          className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold !text-white hover:bg-blue-700"
                        >
                          Open Inbox
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function JobCard({ item, onMetricClick }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="max-w-full truncate text-lg font-black text-slate-900">
              {item.jobName}
            </h3>

            <span className={'rounded-full px-3 py-1 text-xs font-black ring-1 ' + typeClass(item.type)}>
              {item.type}
            </span>

            <span className={'rounded-full px-3 py-1 text-xs font-black ring-1 ' + statusClass(item.status)}>
              {item.status}
            </span>
          </div>

          <p className="mt-2 text-xs text-slate-400">
            {formatDate(item.createdAt)}
          </p>

          {item.id ? (
            <p className="mt-1 break-all text-xs text-slate-400">
              {item.id}
            </p>
          ) : null}

          {item.databaseName ? (
            <p className="mt-1 text-xs text-slate-400">
              Database: {item.databaseName}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[520px]">
          <MiniStat label="Target" value={item.target} onClick={() => onMetricClick(item, 'target')} />
          <MiniStat label="Sent" value={item.sent} className="text-emerald-700" onClick={() => onMetricClick(item, 'sent')} />
          <MiniStat label="Failed" value={item.failed} className="text-red-700" onClick={() => onMetricClick(item, 'failed')} />
          <MiniStat
            label="Interest Rate"
            value={String(item.interestRate || item.rate) + '%'}
            className="text-blue-700"
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <MiniStat label="Replies" value={item.replies} className="text-blue-700" onClick={() => onMetricClick(item, 'replies')} />
        <MiniStat label="Interested" value={item.interested} className="text-emerald-700" onClick={() => onMetricClick(item, 'interested')} />
        <MiniStat label="No Response" value={item.noResponse} className="text-slate-700" onClick={() => onMetricClick(item, 'no_response')} />
        <MiniStat label="Follow-up" value={item.followUp} className="text-amber-700" onClick={() => onMetricClick(item, 'follow_up')} />
        <MiniStat label="Not Int." value={item.notInterested} className="text-red-700" onClick={() => onMetricClick(item, 'not_interested')} />
        <MiniStat label="Opt-out" value={item.optOut} className="text-slate-700" onClick={() => onMetricClick(item, 'opt_out')} />
        <MiniStat label="Hot Lead" value={item.hotLead} className="text-emerald-700" onClick={() => onMetricClick(item, 'hot_lead')} />
        <MiniStat label="Score" value={`${item.score}/100`} className="text-slate-900" onClick={() => onMetricClick(item, 'score')} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
        <p className="text-xs text-slate-500">
          Cost estimate
        </p>
        <p className="text-sm font-black text-slate-900">
          {formatRupiah(item.cost)}
        </p>
      </div>

      <div className="mt-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-xs text-slate-500">
        <b>Rate:</b> Interested / Sent. <b>Score:</b> kualitas lead 0–100.
      </div>
    </div>
  )
}

export default function JobPerformancePage() {
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  const [filters, setFilters] = useState({
    start: '',
    end: '',
    type: '',
    status: '',
    search: ''
  })

  function buildQuery() {
    const params = new URLSearchParams()

    if (filters.start) params.set('start', filters.start)
    if (filters.end) params.set('end', filters.end)
    if (filters.type) params.set('type', filters.type)
    if (filters.status) params.set('status', filters.status)
    if (filters.search) params.set('search', filters.search)

    params.set('t', String(Date.now()))

    return params.toString()
  }

  async function loadData() {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/job-performance/list?' + buildQuery(), {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        cache: 'no-store'
      })

      const data = await response.json().catch(function () {
        return {}
      })

      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Gagal load job performance.')
      }

      const items = Array.isArray(data.items)
        ? data.items
        : Array.isArray(data.rows)
          ? data.rows
          : Array.isArray(data.data)
            ? data.data
            : []

      setRows(items)
      setSummary(data.summary || null)
    } catch (err) {
      setRows([])
      setSummary(null)
      setError(err.message || 'Gagal load job performance.')
    } finally {
      setLoading(false)
    }
  }

  async function openMetricDetail(item, bucket) {
    if (!item.id) {
      setDetail({
        jobId: '',
        jobName: item.jobName,
        bucket,
        rows: []
      })
      setDetailError('Job ID tidak tersedia untuk item ini.')
      return
    }

    setDetail({
      jobId: item.id,
      jobName: item.jobName,
      bucket,
      rows: []
    })
    setDetailLoading(true)
    setDetailError('')

    try {
      const params = new URLSearchParams()
      params.set('job_id', item.id)
      params.set('bucket', bucket)
      params.set('t', String(Date.now()))

      const response = await fetch('/api/job-performance/detail?' + params.toString(), {
        cache: 'no-store'
      })

      const data = await response.json().catch(function () {
        return {}
      })

      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Gagal memuat detail.')
      }

      setDetail({
        jobId: item.id,
        jobName: item.jobName,
        bucket,
        rows: data.rows || []
      })
    } catch (err) {
      setDetailError(err.message || 'Gagal memuat detail.')
    } finally {
      setDetailLoading(false)
    }
  }

  function exportCsv() {
    window.open('/api/job-performance/export?' + buildQuery(), '_blank')
  }

  useEffect(function () {
    loadData()
  }, [])

  const items = useMemo(function () {
    return rows.map(normalizeRow)
  }, [rows])

  const safeSummary = useMemo(function () {
    if (summary) {
      return {
        jobs: summary.jobs || summary.total_jobs || items.length || 0,
        target: summary.target || summary.total || 0,
        sent: summary.sent || 0,
        failed: summary.failed || 0,
        replies: summary.replies || 0,
        noResponse: summary.no_response || summary.noResponse || 0,
        hotLead: summary.hot_lead || summary.hotLead || 0,
        cost: summary.cost || 0
      }
    }

    return items.reduce(
      function (acc, item) {
        acc.jobs += 1
        acc.target += item.target
        acc.sent += item.sent
        acc.failed += item.failed
        acc.replies += item.replies
        acc.noResponse += item.noResponse
        acc.hotLead += item.hotLead
        acc.cost += item.cost
        return acc
      },
      {
        jobs: 0,
        target: 0,
        sent: 0,
        failed: 0,
        replies: 0,
        noResponse: 0,
        hotLead: 0,
        cost: 0
      }
    )
  }, [items, summary])

  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      <Sidebar />

      <main className="flex-1 p-4 lg:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-900 lg:text-3xl">
                Job Performance
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Klik metric di setiap job untuk melihat daftar kontak dan buka Inbox langsung.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Interest Rate = Interested / Sent. Score = kualitas lead 0–100.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={exportCsv}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
              >
                Export CSV
              </button>

              <button
                type="button"
                onClick={loadData}
                disabled={loading}
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-700 disabled:bg-slate-300"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>

          <section className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">
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
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">
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
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">
                Type
              </label>
              <select
                value={filters.type}
                onChange={function (e) {
                  setFilters({
                    ...filters,
                    type: e.target.value
                  })
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              >
                <option value="">Semua</option>
                <option value="blast">Blast</option>
                <option value="reminder">Reminder</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">
                Status
              </label>
              <select
                value={filters.status}
                onChange={function (e) {
                  setFilters({
                    ...filters,
                    status: e.target.value
                  })
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              >
                <option value="">Semua</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="done">Done</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">
                Search
              </label>
              <input
                type="text"
                value={filters.search}
                onChange={function (e) {
                  setFilters({
                    ...filters,
                    search: e.target.value
                  })
                }}
                onKeyDown={function (e) {
                  if (e.key === 'Enter') loadData()
                }}
                placeholder="Cari job..."
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              />
            </div>
          </section>

          <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <MetricCard label="Jobs" value={safeSummary.jobs} />
            <MetricCard label="Target" value={safeSummary.target} />
            <MetricCard label="Sent" value={safeSummary.sent} />
            <MetricCard label="Failed" value={safeSummary.failed} />
            <MetricCard label="Replies" value={safeSummary.replies} />
            <MetricCard label="No Response" value={safeSummary.noResponse} />
            <MetricCard label="Hot Lead" value={safeSummary.hotLead} />
            <MetricCard label="Est. Cost" value={formatRupiah(safeSummary.cost)} />
          </section>

          {error ? (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
              Loading job performance...
            </div>
          ) : null}

          {!loading && !items.length ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
              Belum ada data job performance.
            </div>
          ) : null}

          {!loading && items.length ? (
            <section className="space-y-4">
              {items.map(function (item, index) {
                return (
                  <JobCard
                    key={item.id || index}
                    item={item}
                    onMetricClick={openMetricDetail}
                  />
                )
              })}
            </section>
          ) : null}
        </div>
      </main>

      <DetailPanel
        detail={detail}
        loading={detailLoading}
        error={detailError}
        onClose={() => {
          setDetail(null)
          setDetailError('')
        }}
      />
    </div>
  )
}