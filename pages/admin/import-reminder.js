

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

async function readApiResponse(response) {
const text = await response.text()

try {
return JSON.parse(text)
} catch (err) {
return {
success: false,
message:
text ||
'Server mengembalikan response non-JSON. Kemungkinan file terlalu besar atau upload gagal di server.'
}
}
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

function csvEscape(value) {
const text = String(value ?? '')
return '"' + text.split('"').join('""') + '"'
}

function downloadCsvFile(filename, headers, rows) {
const lines = [
headers.map(csvEscape).join(','),
...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))
]

const csv = '\uFEFF' + lines.join('\n')
const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
const url = URL.createObjectURL(blob)
const link = document.createElement('a')

link.href = url
link.download = filename
document.body.appendChild(link)
link.click()
document.body.removeChild(link)
URL.revokeObjectURL(url)
}

function downloadReminderTemplateWithoutAttachment() {
const headers = [
'name',
'phone',
'message',
'reminder_date'
]

const rows = [
{
name: 'Budi',
phone: '="6285137908391"',
message: 'Halo Kak Budi, ini reminder jadwal layanan dari inHarmony Clinic.',
reminder_date: '2026-06-22 09:00'
},
{
name: 'Sari',
phone: '="6281234567890"',
message: 'Halo Kak Sari, ini reminder jadwal layanan dari inHarmony Clinic.',
reminder_date: '2026-06-22 10:00'
}
]

downloadCsvFile('template_reminder_tanpa_attachment.csv', headers, rows)
}

function downloadReminderTemplateWithAttachment() {
const headers = [
'name',
'phone',
'message',
'reminder_date',
'attachment_url',
'attachment_type',
'attachment_filename',
'attachment_caption'
]

const rows = [
{
name: 'Budi',
phone: '="6285137908391"',
message: 'Halo Kak Budi, ini reminder jadwal layanan dari inHarmony Clinic.',
reminder_date: '2026-06-22 09:00',
attachment_url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
attachment_type: 'document',
attachment_filename: 'reminder_budi.pdf',
attachment_caption: 'Berikut file reminder untuk Kak Budi.'
},
{
name: 'Sari',
phone: '="6281234567890"',
message: 'Halo Kak Sari, ini reminder jadwal layanan dari inHarmony Clinic.',
reminder_date: '2026-06-22 10:00',
attachment_url: 'https://upload.wikimedia.org/wikipedia/commons/3/3f/JPEG_example_flower.jpg',
attachment_type: 'image',
attachment_filename: 'reminder_sari.jpg',
attachment_caption: 'Berikut gambar reminder untuk Kak Sari.'
}
]

downloadCsvFile('template_reminder_dengan_attachment_berbeda.csv', headers, rows)
}

function downloadReminderTemplateWithSeparateTime() {
const headers = [
'name',
'phone',
'message',
'reminder_date',
'reminder_time',
'attachment_url',
'attachment_type',
'attachment_filename',
'attachment_caption'
]

const rows = [
{
name: 'Budi',
phone: '="6285137908391"',
message: 'Halo Kak Budi, ini reminder jadwal layanan dari inHarmony Clinic.',
reminder_date: '2026-06-22',
reminder_time: '09:00',
attachment_url: '',
attachment_type: '',
attachment_filename: '',
attachment_caption: ''
},
{
name: 'Sari',
phone: '="6281234567890"',
message: 'Halo Kak Sari, ini reminder jadwal layanan dari inHarmony Clinic.',
reminder_date: '2026-06-22',
reminder_time: '10:00',
attachment_url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
attachment_type: 'document',
attachment_filename: 'reminder_sari.pdf',
attachment_caption: 'Berikut file reminder untuk Kak Sari.'
}
]

downloadCsvFile('template_reminder_tanggal_dan_jam_terpisah.csv', headers, rows)
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

if (file.size > 1 * 1024 * 1024) {
setGlobalAttachment(null)
setError('Ukuran file terlalu besar. Maksimal attachment adalah 1 MB. Kompres file terlebih dahulu atau gunakan attachment_url di CSV.')
e.target.value = ''
return
}

setUploadingAttachment(true)

try {
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

const data = await readApiResponse(response)

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

if (uploadingAttachment) {
throw new Error('Tunggu upload attachment selesai dulu sebelum import.')
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

const data = await readApiResponse(response)

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
<div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
<div>
<h1 className="text-2xl font-bold text-slate-900">
Import Database Reminder
</h1>
<p className="mt-2 text-sm text-slate-500">
Upload CSV berisi kontak reminder pasien/customer.
</p>
</div>

<div className="flex flex-wrap gap-2">
<button
type="button"
onClick={downloadReminderTemplateWithoutAttachment}
className="rounded-2xl bg-white px-4 py-3 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
>
Download Template Tanpa Attachment
</button>

<button
type="button"
onClick={downloadReminderTemplateWithAttachment}
className="rounded-2xl bg-slate-900 px-4 py-3 text-xs font-bold text-white hover:bg-slate-700"
>
Download Template Dengan Attachment
</button>

<button
type="button"
onClick={downloadReminderTemplateWithSeparateTime}
className="rounded-2xl bg-indigo-600 px-4 py-3 text-xs font-bold text-white hover:bg-indigo-700"
>
Download Template Tanggal + Jam
</button>
</div>
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
Maksimal 1 MB. Upload file di sini kalau semua kontak reminder akan menerima file yang sama.
</p>
{globalAttachment ? (
<p className="mt-2 text-xs font-semibold text-indigo-700">
Attached: {globalAttachment.attachment_filename} ({globalAttachment.attachment_type})
</p>
) : null}
</div>

<div className="flex gap-2">
<label className={
uploadingAttachment
? 'cursor-not-allowed rounded-2xl bg-slate-300 px-4 py-3 text-sm font-bold text-white'
: 'cursor-pointer rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700'
}>
{uploadingAttachment ? 'Uploading...' : 'Attach File'}
<input
type="file"
accept="image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
onChange={handleAttachmentChange}
disabled={uploadingAttachment || loading}
className="hidden"
/>
</label>

{globalAttachment ? (
<button
type="button"
onClick={() => setGlobalAttachment(null)}
disabled={uploadingAttachment || loading}
className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-red-600 ring-1 ring-red-100 hover:bg-red-50 disabled:bg-slate-100 disabled:text-slate-400"
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
disabled={loading || uploadingAttachment}
className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
>
{uploadingAttachment ? 'Waiting Attachment...' : loading ? 'Importing...' : 'Import Reminder'}
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