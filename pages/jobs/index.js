

import { useEffect, useMemo, useState } from 'react'
import Sidebar from '../../components/Sidebar'

function formatDate(value) {
if (!value) return '-'

try {
return new Date(value).toLocaleString('id-ID')
} catch (err) {
return '-'
}
}

function getStatusBadge(status) {
const value = String(status || '').toLowerCase()

if (value === 'done' || value === 'sent' || value === 'completed') {
return 'bg-green-50 text-green-700 ring-green-100'
}

if (value === 'processing') {
return 'bg-blue-50 text-blue-700 ring-blue-100'
}

if (value === 'failed' || value === 'error') {
return 'bg-red-50 text-red-700 ring-red-100'
}

return 'bg-amber-50 text-amber-700 ring-amber-100'
}

function normalizeJobs(data) {
if (Array.isArray(data)) return data
if (Array.isArray(data?.jobs)) return data.jobs
if (Array.isArray(data?.rows)) return data.rows
if (Array.isArray(data?.data)) return data.data
return []
}

function countValue(job, keys, fallback = 0) {
for (const key of keys) {
if (job?.[key] !== undefined && job?.[key] !== null) {
return job[key]
}
}

return fallback
}

export default function JobsPage() {
const [jobs, setJobs] = useState([])
const [loading, setLoading] = useState(true)
const [processing, setProcessing] = useState(false)
const [batchLimit, setBatchLimit] = useState(10)
const [message, setMessage] = useState('')
const [error, setError] = useState('')
const [lastResult, setLastResult] = useState(null)
const [autoRefresh, setAutoRefresh] = useState(true)

const pendingJobs = useMemo(() => {
return jobs.filter((job) => {
const status = String(job.status || '').toLowerCase()
return ['pending', 'queued', 'processing'].includes(status)
})
}, [jobs])

const totalJobs = jobs.length
const pendingCount = pendingJobs.length

async function fetchJson(url, options = {}) {
const response = await fetch(url, {
cache: 'no-store',
...options
})

const data = await response.json().catch(() => null)

if (!response.ok || data?.success === false) {
throw new Error(data?.message || ('Request gagal: ' + url))
}

return data
}

async function loadJobs(silent = false) {
if (!silent) setLoading(true)
setError('')

try {
let data

try {
data = await fetchJson('/api/jobs/list?t=' + Date.now())
} catch (err) {
data = await fetchJson('/api/jobs?t=' + Date.now())
}

setJobs(normalizeJobs(data))
} catch (err) {
setError(err.message || 'Gagal memuat job queue')
} finally {
if (!silent) setLoading(false)
}
}

async function processBatch() {
setProcessing(true)
setMessage('')
setError('')
setLastResult(null)

try {
const limit = Number(batchLimit || 10)

const attachmentResult = await fetchJson(
'/api/jobs/process-attachment-next?limit=' + limit + '&t=' + Date.now()
)

const textResult = await fetchJson(
'/api/jobs/process-next?limit=' + limit + '&t=' + Date.now()
)

const attachmentProcessed = Number(attachmentResult.processed || 0)
const attachmentSent = Number(attachmentResult.sent || 0)
const attachmentFailed = Number(attachmentResult.failed || 0)

const textProcessed = Number(textResult.processed || 0)
const textSent = Number(textResult.sent || 0)
const textFailed = Number(textResult.failed || 0)

setLastResult({
attachment: attachmentResult,
text: textResult
})

setMessage(
'Process selesai. Attachment: ' +
attachmentSent +
' sent, ' +
attachmentFailed +
' failed, ' +
attachmentProcessed +
' processed. Text: ' +
textSent +
' sent, ' +
textFailed +
' failed, ' +
textProcessed +
' processed.'
)

await loadJobs(true)
} catch (err) {
setError(err.message || 'Gagal process batch')
await loadJobs(true)
} finally {
setProcessing(false)
}
}

useEffect(() => {
loadJobs()
}, [])

useEffect(() => {
if (!autoRefresh) return undefined

const timer = setInterval(() => {
loadJobs(true)
}, 7000)

return () => clearInterval(timer)
}, [autoRefresh])

return (
<div className="min-h-screen bg-slate-50 lg:flex">
<Sidebar />

<main className="flex-1 p-4 lg:p-8">
<div className="mx-auto max-w-7xl">
<div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
<div>
<h1 className="text-2xl font-bold text-slate-900">
Job Queue
</h1>
<p className="mt-2 text-sm text-slate-500">
Process job WhatsApp Blast dan Reminder. Attachment akan diproses sebagai media terlebih dahulu.
</p>
</div>

<div className="flex flex-wrap items-center gap-2">
<button
type="button"
onClick={() => loadJobs(false)}
className="rounded-2xl bg-white px-4 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
>
Refresh
</button>

<button
type="button"
onClick={() => setAutoRefresh((value) => !value)}
className={
autoRefresh
? 'rounded-2xl bg-green-50 px-4 py-2 text-sm font-bold text-green-700 ring-1 ring-green-100'
: 'rounded-2xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600 ring-1 ring-slate-200'
}
>
Auto Refresh: {autoRefresh ? 'ON' : 'OFF'}
</button>
</div>
</div>

<div className="mb-6 grid gap-4 md:grid-cols-3">
<div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
<p className="text-sm font-semibold text-slate-500">
Total Jobs
</p>
<p className="mt-2 text-3xl font-bold text-slate-900">
{totalJobs}
</p>
</div>

<div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
<p className="text-sm font-semibold text-slate-500">
Pending / Processing
</p>
<p className="mt-2 text-3xl font-bold text-amber-600">
{pendingCount}
</p>
</div>

<div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
<p className="text-sm font-semibold text-slate-500">
Batch Limit
</p>
<input
type="number"
min="1"
max="100"
value={batchLimit}
onChange={(e) => setBatchLimit(e.target.value)}
className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-600"
/>
</div>
</div>

<section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
<div>
<h2 className="text-xl font-bold text-slate-900">
Process Batch
</h2>
<p className="mt-1 text-sm text-slate-500">
Tombol ini menjalankan attachment processor dulu, lalu text processor.
</p>
</div>

<button
type="button"
onClick={processBatch}
disabled={processing}
className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
>
{processing ? 'Processing...' : 'Process Batch'}
</button>
</div>

<div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
<p className="font-semibold text-slate-700">
Urutan proses:
</p>
<p className="mt-1">
1. Kirim semua item yang punya <b>attachment_url</b> lewat media endpoint.
</p>
<p>
2. Kirim sisa item tanpa attachment lewat text endpoint biasa.
</p>
</div>

{message ? (
<div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
{message}
</div>
) : null}

{error ? (
<div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
{error}
</div>
) : null}

{lastResult ? (
<details className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
<summary className="cursor-pointer text-sm font-bold text-slate-700">
Detail response terakhir
</summary>

<pre className="mt-3 max-h-80 overflow-auto rounded-2xl bg-slate-900 p-4 text-xs text-slate-100">
{JSON.stringify(lastResult, null, 2)}
</pre>
</details>
) : null}
</section>

<section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
<div className="border-b border-slate-200 p-5 lg:p-6">
<h2 className="text-xl font-bold text-slate-900">
Jobs
</h2>
<p className="mt-1 text-sm text-slate-500">
Daftar job terbaru.
</p>
</div>

{loading ? (
<div className="p-6 text-sm text-slate-500">
Loading jobs...
</div>
) : jobs.length === 0 ? (
<div className="p-6 text-sm text-slate-500">
Belum ada job.
</div>
) : (
<div className="overflow-x-auto">
<table className="min-w-[1050px] w-full text-left text-sm">
<thead>
<tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
<th className="px-4 py-3">Job</th>
<th className="px-4 py-3">Type</th>
<th className="px-4 py-3">Status</th>
<th className="px-4 py-3">Total</th>
<th className="px-4 py-3">Sent</th>
<th className="px-4 py-3">Failed</th>
<th className="px-4 py-3">Created</th>
<th className="px-4 py-3">Action</th>
</tr>
</thead>

<tbody>
{jobs.map((job) => {
const title =
job.name ||
job.title ||
job.database_name ||
job.contact_database_name ||
job.id

const total = countValue(job, [
'total_items',
'total',
'item_count',
'target_count'
])

const sent = countValue(job, [
'sent_items',
'sent_count',
'sent'
])

const failed = countValue(job, [
'failed_items',
'failed_count',
'failed'
])

return (
<tr key={job.id} className="border-b border-slate-100">
<td className="px-4 py-4">
<div className="max-w-sm">
<p className="truncate font-bold text-slate-900">
{title}
</p>
<p className="mt-1 text-xs text-slate-400">
{job.id}
</p>
</div>
</td>

<td className="px-4 py-4">
<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
{job.type || job.job_type || '-'}
</span>
</td>

<td className="px-4 py-4">
<span className={'rounded-full px-3 py-1 text-xs font-bold ring-1 ' + getStatusBadge(job.status)}>
{job.status || 'pending'}
</span>
</td>

<td className="px-4 py-4 font-semibold text-slate-700">
{total}
</td>

<td className="px-4 py-4 font-semibold text-green-700">
{sent}
</td>

<td className="px-4 py-4 font-semibold text-red-700">
{failed}
</td>

<td className="px-4 py-4 text-xs text-slate-500">
{formatDate(job.created_at)}
</td>

<td className="px-4 py-4">
<button
type="button"
onClick={processBatch}
disabled={processing}
className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:bg-slate-300"
>
{processing ? '...' : 'Process'}
</button>
</td>
</tr>
)
})}
</tbody>
</table>
</div>
)}
</section>
</div>
</main>
</div>
)
}