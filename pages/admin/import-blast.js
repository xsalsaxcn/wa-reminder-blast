

import { useState } from 'react'
import Sidebar from '../../components/Sidebar'
import {
IMPORT_CHUNK_SIZE,
MAX_FILE_SIZE,
downloadCsvFile,
fetchWithTimeout,
normalizeBlastRows,
parseCsv,
readApiResponse,
uploadAttachmentDirect,
validateMimeType,
wait
} from '../../lib/importClientUtils'

function downloadBlastTemplateWithoutAttachment() {
downloadCsvFile(
'template_blast_tanpa_attachment.csv',
['name', 'phone', 'message'],
[
{
name: 'Indira',
phone: '="6285137908391"',
message: 'Halo Kak Indira, ini informasi dari Notiva.'
},
{
name: 'Andin',
phone: '="6281234567890"',
message: 'Halo Kak Andin, ini informasi dari Notiva.'
}
]
)
}

function downloadBlastTemplateWithAttachment() {
downloadCsvFile(
'template_blast_dengan_attachment_berbeda.csv',
['name', 'phone', 'message', 'attachment_url', 'attachment_type', 'attachment_filename', 'attachment_caption'],
[
{
name: 'Indira',
phone: '="6285137908391"',
message: 'Halo Kak Indira, berikut kami kirimkan file PDF.',
attachment_url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
attachment_type: 'document',
attachment_filename: 'file_indira.pdf',
attachment_caption: 'Berikut file PDF untuk Kak Indira.'
},
{
name: 'Andin',
phone: '="6281234567890"',
message: 'Halo Kak Andin, berikut kami kirimkan gambar.',
attachment_url: 'https://upload.wikimedia.org/wikipedia/commons/3/3f/JPEG_example_flower.jpg',
attachment_type: 'image',
attachment_filename: 'gambar_andin.jpg',
attachment_caption: 'Berikut gambar untuk Kak Andin.'
}
]
)
}

export default function ImportBlastPage() {
const [databaseName, setDatabaseName] = useState('')
const [fileName, setFileName] = useState('')
const [rows, setRows] = useState([])
const [selectedAttachmentFile, setSelectedAttachmentFile] = useState(null)
const [loading, setLoading] = useState(false)
const [uploadingAttachment, setUploadingAttachment] = useState(false)
const [progressText, setProgressText] = useState('')
const [message, setMessage] = useState('')
const [error, setError] = useState('')

function applyAttachmentToChunk(chunk, uploadedAttachment) {
return chunk.map((row) => {
if (!uploadedAttachment || row.attachment_url) return row

return {
...row,
attachment_url: uploadedAttachment.attachment_url,
attachment_type: uploadedAttachment.attachment_type,
attachment_filename: uploadedAttachment.attachment_filename,
attachment_caption: row.attachment_caption || row.message || uploadedAttachment.attachment_filename
}
})
}

async function handleFileChange(e) {
const file = e.target.files?.[0]

setRows([])
setFileName('')
setMessage('')
setError('')
setProgressText('')

if (!file) return

const text = await file.text()
const parsed = parseCsv(text)
const normalized = normalizeBlastRows(parsed)

setFileName(file.name)
setRows(normalized)
setMessage('CSV terbaca: ' + normalized.length + ' baris.')
}

function handleAttachmentChange(e) {
const file = e.target.files?.[0]

setMessage('')
setError('')
setProgressText('')

if (!file) return

if (file.size > MAX_FILE_SIZE) {
setSelectedAttachmentFile(null)
setError('Ukuran file terlalu besar. Maksimal attachment adalah 1 MB.')
e.target.value = ''
return
}

const mimeType = String(file.type || '').trim().toLowerCase()

if (!validateMimeType(mimeType)) {
setSelectedAttachmentFile(null)
setError('Format file belum didukung. Gunakan JPG, PNG, WEBP, PDF, DOC/DOCX, atau XLS/XLSX.')
e.target.value = ''
return
}

setSelectedAttachmentFile(file)
setMessage('Attachment dipilih: ' + file.name + '. File akan di-upload saat klik Import Blast.')
e.target.value = ''
}

async function handleImport(e) {
e.preventDefault()

if (loading) return

setLoading(true)
setUploadingAttachment(false)
setMessage('')
setError('')
setProgressText('Mulai import...')

try {
if (!databaseName.trim()) {
throw new Error('Nama database wajib diisi.')
}

if (!rows.length) {
throw new Error('CSV belum dipilih atau kosong.')
}

let uploadedAttachment = null

if (selectedAttachmentFile) {
setUploadingAttachment(true)
setProgressText('Mengupload attachment...')
uploadedAttachment = await uploadAttachmentDirect(selectedAttachmentFile)
setUploadingAttachment(false)
}

setProgressText('Membuat database kontak...')

const databaseResponse = await fetchWithTimeout(
'/api/contacts/create-import-database',
{
method: 'POST',
headers: {
'Content-Type': 'application/json'
},
body: JSON.stringify({
databaseName: databaseName.trim(),
type: 'blast'
})
},
15000
)

const databaseData = await readApiResponse(databaseResponse)

if (!databaseResponse.ok || !databaseData.success || !databaseData.database?.id) {
throw new Error(databaseData.message || 'Gagal membuat database kontak.')
}

const databaseId = databaseData.database.id

let imported = 0
let skipped = 0
let withAttachment = 0

for (let i = 0; i < rows.length; i += IMPORT_CHUNK_SIZE) {
const chunk = rows.slice(i, i + IMPORT_CHUNK_SIZE)
const finalChunk = applyAttachmentToChunk(chunk, uploadedAttachment)
const currentChunk = Math.floor(i / IMPORT_CHUNK_SIZE) + 1
const totalChunk = Math.ceil(rows.length / IMPORT_CHUNK_SIZE)

setProgressText('Import chunk ' + currentChunk + ' dari ' + totalChunk + '...')

const response = await fetchWithTimeout(
'/api/contacts/import-chunk',
{
method: 'POST',
headers: {
'Content-Type': 'application/json'
},
body: JSON.stringify({
databaseId,
type: 'blast',
contacts: finalChunk
})
},
15000
)

const data = await readApiResponse(response)

if (!response.ok || !data.success) {
throw new Error(data.message || 'Import chunk gagal.')
}

imported += Number(data.imported || 0)
skipped += Number(data.skipped || 0)
withAttachment += Number(data.with_attachment || 0)

setProgressText('Progress: ' + Math.min(i + IMPORT_CHUNK_SIZE, rows.length) + ' / ' + rows.length + ' baris.')
await wait(40)
}

setMessage(
'Import berhasil: ' +
imported +
' kontak. Skipped: ' +
skipped +
'. Attachment: ' +
withAttachment +
'.'
)

setRows([])
setFileName('')
setSelectedAttachmentFile(null)
setProgressText('')
} catch (err) {
if (err.name === 'AbortError') {
setError('Request terlalu lama dan dihentikan otomatis. Cek Database Manager apakah data sebagian sudah masuk.')
} else {
setError(err.message || 'Import blast gagal.')
}
} finally {
setLoading(false)
setUploadingAttachment(false)
}
}

const attachmentCount = rows.filter((row) => row.attachment_url || selectedAttachmentFile).length

return (
<div className="min-h-screen bg-slate-50 lg:flex">
<Sidebar />

<main className="flex-1 p-4 lg:p-8">
<div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
<div>
<h1 className="text-2xl font-bold text-slate-900">
Import Database WhatsApp Blast
</h1>
<p className="mt-2 text-sm text-slate-500">
Upload CSV berisi kontak untuk WhatsApp Blast.
</p>
</div>

<div className="flex flex-wrap gap-2">
<button
type="button"
onClick={downloadBlastTemplateWithoutAttachment}
disabled={loading}
className="rounded-2xl bg-white px-4 py-3 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
>
Download Template Tanpa Attachment
</button>

<button
type="button"
onClick={downloadBlastTemplateWithAttachment}
disabled={loading}
className="rounded-2xl bg-slate-900 px-4 py-3 text-xs font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
>
Download Template Dengan Attachment
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
disabled={loading}
placeholder="Contoh: Blast Promo MCU Juni"
className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-600 disabled:bg-slate-100"
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
disabled={loading}
className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-600 disabled:bg-slate-100"
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
Maksimal 1 MB. File akan di-upload saat tombol Import diklik.
</p>
{selectedAttachmentFile ? (
<p className="mt-2 text-xs font-semibold text-indigo-700">
File siap: {selectedAttachmentFile.name}
</p>
) : null}
</div>

<div className="flex gap-2">
<label
className={
loading
? 'cursor-not-allowed rounded-2xl bg-slate-300 px-4 py-3 text-sm font-bold text-white'
: 'cursor-pointer rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700'
}
>
Attach File
<input
type="file"
accept="image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
onChange={handleAttachmentChange}
disabled={loading}
className="hidden"
/>
</label>

{selectedAttachmentFile ? (
<button
type="button"
onClick={() => setSelectedAttachmentFile(null)}
disabled={loading}
className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-red-600 ring-1 ring-red-100 hover:bg-red-50 disabled:bg-slate-100 disabled:text-slate-400"
>
Remove
</button>
) : null}
</div>
</div>
</div>

{rows.length > 0 ? (
<div className="rounded-2xl border border-slate-200 bg-white p-4">
<p className="text-sm font-semibold text-slate-700">
Preview: {rows.length} baris
</p>
<p className="mt-1 text-xs text-slate-500">
Dengan attachment: {attachmentCount} baris
</p>
</div>
) : null}

<button
type="submit"
disabled={loading}
className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
>
{uploadingAttachment ? 'Uploading Attachment...' : loading ? 'Importing...' : 'Import Blast'}
</button>

{progressText ? (
<div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
{progressText}
</div>
) : null}

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