

import { useState } from 'react'
import Sidebar from '../../components/Sidebar'

function parseCsv(text) {
const rows = []
let current = []
let value = ''
let inQuotes = false

for (let i = 0; i < text.length; i++) {
const char = text[i]
const next = text[i + 1]

if (char === '"' && inQuotes && next === '"') {
value += '"'
i++
continue
}

if (char === '"') {
inQuotes = !inQuotes
continue
}

if (char === ',' && !inQuotes) {
current.push(value)
value = ''
continue
}

if ((char === '\n' || char === '\r') && !inQuotes) {
if (char === '\r' && next === '\n') i++

current.push(value)

if (current.some((item) => String(item || '').trim() !== '')) {
rows.push(current)
}

current = []
value = ''
continue
}

value += char
}

current.push(value)

if (current.some((item) => String(item || '').trim() !== '')) {
rows.push(current)
}

if (rows.length === 0) return []

const headers = rows[0].map((item) =>
String(item || '')
.replace(/^\uFEFF/, '')
.trim()
.toLowerCase()
)

return rows.slice(1).map((row) => {
const obj = {}

headers.forEach((header, index) => {
obj[header] = String(row[index] || '').trim()
})

return obj
})
}

function cleanFormulaPhone(value) {
return String(value || '')
.trim()
.replace(/^="/, '')
.replace(/"$/, '')
.replace(/^'/, '')
}

function fileToBase64(file) {
return new Promise((resolve, reject) => {
const reader = new FileReader()
reader.onload = () => resolve(reader.result)
reader.onerror = reject
reader.readAsDataURL(file)
})
}

function normalizeParsedRows(parsed) {
return parsed.map((row) => ({
name: row.name || row.nama || row.customer_name || '',
phone: cleanFormulaPhone(row.phone || row.nomor || row.no_hp || row.whatsapp || row.wa || ''),
message: row.message || row.pesan || row.text || row.body || '',
reminder_date: row.reminder_date || row.tanggal || row.date || row.scheduled_at || row.send_at || '',
reminder_time: row.reminder_time || row.jam || row.time || '',
attachment_url: row.attachment_url || row.file_url || row.document_url || row.image_url || row.media_url || row.link_file || '',
attachment_type: row.attachment_type || row.file_type || row.media_type || '',
attachment_filename: row.attachment_filename || row.filename || row.file_name || row.nama_file || '',
attachment_caption: row.attachment_caption || row.caption || row.file_caption || ''
}))
}

function combineReminderDateTime(row) {
const date = String(row.reminder_date || '').trim()
const time = String(row.reminder_time || '').trim()

if (!date) return ''

if (date.includes(':')) return date

if (time) return date + ' ' + time

return date
}

export default function ImportReminderPage() {
const [databaseName, setDatabaseName] = useState('')
const [fileName, setFileName] = useState('')
const [rows, setRows] = useState([])
const [globalAttachment, setGlobalAttachment] = useState(null)
const [uploadingAttachment, setUploadingAttachment] = useState(false)
const [loading, setLoading] = useState(false)
const [message, setMessage] = useState('')
const [error, setError] = useState('')

function rowsWithAttachment() {
return rows.map((row) => {
const finalReminderDate = combineReminderDateTime(row)

if (!globalAttachment || row.attachment_url) {
return {
...row,
reminder_date: finalReminderDate
}
}

return {
...row,
reminder_date: finalReminderDate,
attachment_url: globalAttachment.attachment_url,
attachment_type: globalAttachment.attachment_type,
attachment_filename: globalAttachment.attachment_filename,
attachment_caption: row.attachment_caption || row.message || globalAttachment.attachment_filename
}
})
}

async function handleFileChange(e) {
const file = e.target.files?.[0]

setRows([])
setMessage('')
setError('')

if (!file) return

setFileName(file.name)

const text = await file.text()
const parsed = parseCsv(text)
setRows(normalizeParsedRows(parsed))
}

async function handleAttachmentChange(e) {
const file = e.target.files?.[0]

setMessage('')
setError('')

if (!file) return

setUploadingAttachment(true)

try {
if (file.size > 5 * 1024 * 1024) {
throw new Error('Ukuran attachment maksimal 5 MB')
}

const base64 = await fileToBase64(file)

const response = await fetch('/api/attachments/upload', {
method: 'POST',
headers: {
'Content-Type': 'application/json'
},
body: JSON.stringify({
fileName: file.name,
mimeType: file.type,
base64
})
})

const data = await response.json()

if (!response.ok || !data.success) {
throw new Error(data.message || 'Upload attachment gagal')
}

setGlobalAttachment({
attachment_url: data.attachment_url,
attachment_type: data.attachment_type,
attachment_filename: data.attachment_filename
})

setMessage('Attachment berhasil di-upload: ' + data.attachment_filename)
} catch (err) {
setGlobalAttachment(null)
setError(err.message || 'Upload attachment gagal')
} finally {
setUploadingAttachment(false)
e.target.value = ''
}
}

async function handleImport(e) {
e.preventDefault()

setLoading(true)
setMessage('')
setError('')

try {
if (!databaseName.trim()) {
throw new Error('Nama database wajib diisi')
}

if (rows.length === 0) {
throw new Error('File CSV belum dipilih atau kosong')
}

const finalRows = rowsWithAttachment()

const response = await fetch('/api/contacts/import', {
method: 'POST',
headers: {
'Content-Type': 'application/json'
},
body: JSON.stringify({
databaseName: databaseName.trim(),
type: 'reminder',
contacts: finalRows
})
})

const data = await response.json()

if (!response.ok || !data.success) {
throw new Error(data.message || 'Import reminder gagal')
}

setMessage(
'Import berhasil: ' +
(data.imported || data.total || finalRows.length) +
' kontak. Attachment: ' +
(data.with_attachment || 0) +
'.'
)

setRows([])
setFileName('')
setGlobalAttachment(null)
} catch (err) {
setError(err.message || 'Import reminder gagal')
} finally {
setLoading(false)
}
}

const previewRows = rowsWithAttachment()
const attachmentCount = previewRows.filter((row) => row.attachment_url).length

return (
<div className="min-h-screen bg-slate-50 lg:flex">
<Sidebar />

<main className="flex-1 p-4 lg:p-8">
<div className="mb-6">
<h1 className="text-2xl font-bold text-slate-900">
Import Database Reminder
</h1>
<p className="mt-2 text-sm text-slate-500">
Upload CSV berisi kontak reminder pasien/customer.
</p>
</div>

<form
onSubmit={handleImport}
className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6"
>
<div className="space-y-5">
<div>
<label className="mb-2 block text-sm font-semibold text-slate-700">
Nama Database
</label>
<input
value={databaseName}
onChange={(e) => setDatabaseName(e.target.value)}
placeholder="Contoh: Reminder MCU Juni"
className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-600"
/>
</div>

<div>
<label className="mb-2 block text-sm font-semibold text-slate-700">
File CSV
</label>
<input
type="file"
accept=".csv,text/csv"
onChange={handleFileChange}
className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-600"
/>
{fileName ? (
<p className="mt-2 text-xs text-slate-500">
File: {fileName}
</p>
) : null}
</div>

<div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50 p-4">
<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
<div>
<p className="text-sm font-bold text-slate-800">
Attachment untuk semua kontak
</p>
<p className="mt-1 text-xs text-slate-500">
Upload file di sini kalau semua kontak reminder akan menerima file yang sama.
</p>
{globalAttachment ? (
<p className="mt-2 text-xs font-semibold text-indigo-700">
Attached: {globalAttachment.attachment_filename} ({globalAttachment.attachment_type})
</p>
) : null}
</div>

<div className="flex gap-2">
<label className="cursor-pointer rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700">
{uploadingAttachment ? 'Uploading...' : 'Attach File'}
<input
type="file"
accept="image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
onChange={handleAttachmentChange}
disabled={uploadingAttachment}
className="hidden"
/>
</label>

{globalAttachment ? (
<button
type="button"
onClick={() => setGlobalAttachment(null)}
className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-red-600 ring-1 ring-red-100 hover:bg-red-50"
>
Remove
</button>
) : null}
</div>
</div>
</div>

<div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
<p className="font-semibold text-slate-700">Format kolom CSV:</p>
<code className="mt-2 block whitespace-pre-wrap text-xs">
name, phone, message, reminder_date, attachment_url, attachment_type, attachment_filename, attachment_caption
</code>
<p className="mt-2 text-xs">
Kolom attachment boleh kosong kalau memakai tombol Attach File.
</p>
<p className="mt-1 text-xs">
Bisa juga pakai kolom reminder_time terpisah, contoh: reminder_date = 2026-06-22 dan reminder_time = 09:00.
</p>
</div>

{rows.length > 0 ? (
<div className="rounded-2xl border border-slate-200 bg-white p-4">
<p className="text-sm font-semibold text-slate-700">
Preview: {previewRows.length} baris
</p>
<p className="mt-1 text-xs text-slate-500">
Dengan attachment: {attachmentCount} baris
</p>

<div className="mt-3 overflow-x-auto">
<table className="min-w-[980px] text-left text-xs">
<thead>
<tr className="border-b text-slate-500">
<th className="py-2 pr-4">Name</th>
<th className="py-2 pr-4">Phone</th>
<th className="py-2 pr-4">Reminder Date</th>
<th className="py-2 pr-4">Attachment</th>
<th className="py-2 pr-4">Type</th>
</tr>
</thead>
<tbody>
{previewRows.slice(0, 5).map((row, index) => (
<tr key={index} className="border-b">
<td className="py-2 pr-4">{row.name}</td>
<td className="py-2 pr-4">{row.phone}</td>
<td className="py-2 pr-4">{row.reminder_date}</td>
<td className="max-w-xs truncate py-2 pr-4">{row.attachment_url || '-'}</td>
<td className="py-2 pr-4">{row.attachment_type || '-'}</td>
</tr>
))}
</tbody>
</table>
</div>
</div>
) : null}

<button
type="submit"
disabled={loading}
className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
>
{loading ? 'Importing...' : 'Import Reminder'}
</button>

{message ? (
<div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
{message}
</div>
) : null}

{error ? (
<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
{error}
</div>
) : null}
</div>
</form>
</main>
</div>
)
}