

import { useEffect, useMemo, useState } from 'react'
import Sidebar from '../../components/Sidebar'

function cleanText(value) {
return String(value ?? '').trim()
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

function toNumber(value) {
const number = Number(value)

if (!Number.isFinite(number)) return 0

return number
}

function getFirst(row, keys, fallback = '') {
for (const key of keys) {
if (row && row[key] !== undefined && row[key] !== null && row[key] !== '') {
return row[key]
}
}

return fallback
}

function normalizeRow(row) {
const jobId = getFirst(row, ['job_id', 'id', 'jobId'])
const jobName =
getFirst(row, ['job_name', 'name', 'title', 'database_name', 'campaign_name']) ||
getFirst(row, ['databaseName']) ||
'Campaign'

const type = getFirst(row, ['type', 'job_type'], '-')
const status = getFirst(row, ['status', 'job_status'], '-')

const total = toNumber(getFirst(row, ['total', 'total_items', 'total_contacts'], 0))
const sent = toNumber(getFirst(row, ['sent', 'sent_items', 'sent_count'], 0))
const failed = toNumber(getFirst(row, ['failed', 'failed_items', 'failed_count'], 0))
const pending = toNumber(getFirst(row, ['pending', 'pending_items', 'pending_count'], 0))
const replies = toNumber(getFirst(row, ['replies', 'reply_count', 'total_replies'], 0))
const interested = toNumber(getFirst(row, ['interested', 'interested_count', 'positive', 'positive_count'], 0))
const notInterested = toNumber(getFirst(row, ['not_interested', 'notInterested', 'not_interested_count', 'negative', 'negative_count'], 0))
const neutral = toNumber(getFirst(row, ['neutral', 'neutral_count'], 0))

const responseRateRaw = getFirst(row, ['response_rate', 'reply_rate'], '')
const responseRate =
responseRateRaw !== ''
? responseRateRaw
: sent > 0
? Math.round((replies / sent) * 100)
: 0

return {
raw: row,
jobId,
jobName,
createdAt: getFirst(row, ['created_at', 'createdAt', 'started_at']),
type,
status,
total,
sent,
failed,
pending,
replies,
interested,
notInterested,
neutral,
responseRate
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

return 'bg-slate-100 text-slate-700 ring-slate-200'
}

function MetricBox({ label, value }) {
return (
<div className="rounded-2xl bg-slate-50 p-3">
<p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
{label}
</p>
<p className="mt-1 text-lg font-black text-slate-900">
{value}
</p>
</div>
)
}

function MobileJobCard({ item }) {
return (
<div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
<div className="flex items-start justify-between gap-3">
<div className="min-w-0">
<h3 className="truncate text-lg font-black text-slate-900">
{item.jobName}
</h3>
<p className="mt-1 text-xs text-slate-400">
{formatDate(item.createdAt)}
</p>
<p className="mt-1 truncate text-xs text-slate-400">
{item.jobId || '-'}
</p>
</div>

<div className="flex shrink-0 flex-col items-end gap-2">
<span className={'rounded-full px-3 py-1 text-xs font-black ring-1 ' + statusClass(item.status)}>
{item.status}
</span>
<span className={'rounded-full px-3 py-1 text-xs font-black ring-1 ' + typeClass(item.type)}>
{item.type}
</span>
</div>
</div>

<div className="mt-4 grid grid-cols-2 gap-3">
<MetricBox label="Total" value={item.total} />
<MetricBox label="Sent" value={item.sent} />
<MetricBox label="Failed" value={item.failed} />
<MetricBox label="Pending" value={item.pending} />
<MetricBox label="Replies" value={item.replies} />
<MetricBox label="Rate" value={String(item.responseRate) + '%'} />
</div>

<div className="mt-4 rounded-2xl bg-slate-50 p-3">
<p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
Reply Analysis
</p>
<div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
<span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 ring-1 ring-emerald-100">
Interested {item.interested}
</span>
<span className="rounded-full bg-red-50 px-3 py-1 text-red-700 ring-1 ring-red-100">
Not Interested {item.notInterested}
</span>
<span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700 ring-1 ring-blue-100">
Neutral {item.neutral}
</span>
</div>
</div>
</div>
)
}

export default function JobPerformancePage() {
const [rows, setRows] = useState([])
const [loading, setLoading] = useState(true)
const [refreshingAnalysis, setRefreshingAnalysis] = useState(false)
const [error, setError] = useState('')

async function refreshAnalysis() {
setRefreshingAnalysis(true)

try {
await fetch('/api/admin/analyze-inbox', {
method: 'POST',
headers: {
'Content-Type': 'application/json'
}
})
} catch (err) {
console.warn('analyze-inbox skipped:', err.message)
} finally {
setRefreshingAnalysis(false)
}
}

async function loadData() {
setLoading(true)
setError('')

await refreshAnalysis()

const endpoints = [
'/api/job-performance',
'/api/jobs/performance',
'/api/job-performance/list'
]

let lastError = ''

for (const endpoint of endpoints) {
try {
const response = await fetch(endpoint, {
method: 'GET',
headers: {
Accept: 'application/json'
}
})

const text = await response.text()
let data = {}

try {
data = JSON.parse(text)
} catch (err) {
data = {}
}

if (!response.ok) {
lastError = data.message || endpoint + ' gagal.'
continue
}

const items =
Array.isArray(data)
? data
: Array.isArray(data.items)
? data.items
: Array.isArray(data.rows)
? data.rows
: Array.isArray(data.jobs)
? data.jobs
: Array.isArray(data.data)
? data.data
: []

setRows(items)
setLoading(false)
return
} catch (err) {
lastError = err.message || 'Gagal load data.'
}
}

setError(lastError || 'Gagal load job performance.')
setRows([])
setLoading(false)
}

useEffect(() => {
loadData()
}, [])

const items = useMemo(() => {
return rows.map(normalizeRow)
}, [rows])

const summary = useMemo(() => {
return items.reduce(
(acc, item) => {
acc.totalJobs += 1
acc.totalSent += item.sent
acc.totalFailed += item.failed
acc.totalReplies += item.replies
acc.interested += item.interested
acc.notInterested += item.notInterested
acc.neutral += item.neutral
return acc
},
{
totalJobs: 0,
totalSent: 0,
totalFailed: 0,
totalReplies: 0,
interested: 0,
notInterested: 0,
neutral: 0
}
)
}, [items])

return (
<div className="min-h-screen bg-slate-50 lg:flex">
<Sidebar />

<main className="flex-1 p-4 lg:p-8">
<div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
<div>
<h1 className="text-2xl font-black text-slate-900 lg:text-3xl">
Campaign / Job Result
</h1>
<p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 lg:text-base">
Data gabungan dari Job Queue, Usage Log, dan Reply Analysis.
</p>
</div>

<button
type="button"
onClick={loadData}
disabled={loading || refreshingAnalysis}
className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
>
{loading || refreshingAnalysis ? 'Refreshing...' : 'Refresh'}
</button>
</div>

<section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
<div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
<p className="text-xs font-bold uppercase tracking-wide text-slate-400">Jobs</p>
<p className="mt-2 text-2xl font-black text-slate-900">{summary.totalJobs}</p>
</div>

<div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
<p className="text-xs font-bold uppercase tracking-wide text-slate-400">Sent</p>
<p className="mt-2 text-2xl font-black text-emerald-600">{summary.totalSent}</p>
</div>

<div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
<p className="text-xs font-bold uppercase tracking-wide text-slate-400">Failed</p>
<p className="mt-2 text-2xl font-black text-red-600">{summary.totalFailed}</p>
</div>

<div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
<p className="text-xs font-bold uppercase tracking-wide text-slate-400">Replies</p>
<p className="mt-2 text-2xl font-black text-blue-600">{summary.totalReplies}</p>
</div>
</section>

<section className="mb-5 grid grid-cols-3 gap-3">
<div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
<p className="text-xs font-bold uppercase tracking-wide text-emerald-500">Interested</p>
<p className="mt-2 text-2xl font-black text-emerald-700">{summary.interested}</p>
</div>

<div className="rounded-3xl border border-red-100 bg-red-50 p-4 shadow-sm">
<p className="text-xs font-bold uppercase tracking-wide text-red-500">Not</p>
<p className="mt-2 text-2xl font-black text-red-700">{summary.notInterested}</p>
</div>

<div className="rounded-3xl border border-blue-100 bg-blue-50 p-4 shadow-sm">
<p className="text-xs font-bold uppercase tracking-wide text-blue-500">Neutral</p>
<p className="mt-2 text-2xl font-black text-blue-700">{summary.neutral}</p>
</div>
</section>

{refreshingAnalysis ? (
<div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
Menganalisis inbox terbaru...
</div>
) : null}

{error ? (
<div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
{error}
</div>
) : null}

{loading ? (
<div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
Loading job performance...
</div>
) : null}

{!loading && !items.length ? (
<div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
Belum ada data campaign/job result.
</div>
) : null}

{!loading && items.length ? (
<>
<section className="space-y-4 lg:hidden">
{items.map((item, index) => (
<MobileJobCard key={item.jobId || index} item={item} />
))}
</section>

<section className="hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:block">
<div className="overflow-x-auto">
<table className="min-w-[1180px] w-full text-left text-sm">
<thead>
<tr className="border-b bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
<th className="px-5 py-4">Job</th>
<th className="px-5 py-4">Type</th>
<th className="px-5 py-4">Status</th>
<th className="px-5 py-4">Total</th>
<th className="px-5 py-4">Sent</th>
<th className="px-5 py-4">Failed</th>
<th className="px-5 py-4">Pending</th>
<th className="px-5 py-4">Replies</th>
<th className="px-5 py-4">Interested</th>
<th className="px-5 py-4">Not</th>
<th className="px-5 py-4">Neutral</th>
<th className="px-5 py-4">Rate</th>
</tr>
</thead>

<tbody>
{items.map((item, index) => (
<tr key={item.jobId || index} className="border-b last:border-b-0">
<td className="px-5 py-4">
<div className="max-w-[240px]">
<p className="truncate font-black text-slate-900">
{item.jobName}
</p>
<p className="mt-1 truncate text-xs text-slate-400">
{formatDate(item.createdAt)}
</p>
<p className="mt-1 truncate text-xs text-slate-400">
{item.jobId || '-'}
</p>
</div>
</td>
<td className="px-5 py-4">
<span className={'rounded-full px-3 py-1 text-xs font-black ring-1 ' + typeClass(item.type)}>
{item.type}
</span>
</td>
<td className="px-5 py-4">
<span className={'rounded-full px-3 py-1 text-xs font-black ring-1 ' + statusClass(item.status)}>
{item.status}
</span>
</td>
<td className="px-5 py-4 font-bold text-slate-700">{item.total}</td>
<td className="px-5 py-4 font-bold text-emerald-700">{item.sent}</td>
<td className="px-5 py-4 font-bold text-red-700">{item.failed}</td>
<td className="px-5 py-4 font-bold text-slate-700">{item.pending}</td>
<td className="px-5 py-4 font-bold text-blue-700">{item.replies}</td>
<td className="px-5 py-4 font-bold text-emerald-700">{item.interested}</td>
<td className="px-5 py-4 font-bold text-red-700">{item.notInterested}</td>
<td className="px-5 py-4 font-bold text-blue-700">{item.neutral}</td>
<td className="px-5 py-4 font-bold text-slate-900">{item.responseRate}%</td>
</tr>
))}
</tbody>
</table>
</div>
</section>
</>
) : null}
</main>
</div>
)
}