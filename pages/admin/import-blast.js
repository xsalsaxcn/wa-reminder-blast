

import { useRef, useState } from 'react'
import Sidebar from '../../components/Sidebar'
import {
downloadCsvFile,
fetchWithTimeout,
normalizeBlastRows,
parseCsv,
readApiResponse,
wait
} from '../../lib/importClientUtils'

const MAX_ROWS = 5000
const IMPORT_CHUNK_SIZE_SAFE = 25

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

function guessAttachmentType(url) {
const text = String(url || '').toLowerCase()

if (
text.includes('.jpg') ||
text.includes('.jpeg') ||
text.includes('.png') ||
text.includes('.webp')
) {
return 'image'
}

return 'document'
}

function guessFileName(url) {
try {
const parsed = new URL(url)
const parts = parsed.pathname.split('/')
const last = parts[parts.length - 1]

if (last) return decodeURIComponent(last)
} catch (err) {
return 'attachment'
}

return 'attachment'
}

function isValidUrl(value) {
try {
const url = new URL(value)

return url.protocol === 'http:' || url.protocol === 'https:'
} catch (err) {
return false
}
}

export default function ImportBlastPage() {
const rowsRef = useRef([])

const [databaseName, setDatabaseName] = useState('')
const [fileName, setFileName] = useState('')
const [rowCount, setRowCount] = useState(0)
const [csvAttachmentCount, setCsvAttachmentCount] = useState(0)

const [showAttachBox, setShowAttachBox] = useState(false)
const [attachmentUrlInput, setAttachmentUrlInput] = useState('')
const [attachmentTypeInput, setAttachmentTypeInput] = useState('auto')
const [attachmentCaptionInput, setAttachmentCaptionInput] = useState('')
const [attachmentMeta, setAttachmentMeta] = useState(null)

const [loading, setLoading] = useState(false)
const [progressText, setProgressText] = useState('')
const [progressPercent, setProgressPercent] = useState(0)
const [message, setMessage] = useState('')
const [error, setError] = useState('')

function resetCsv() {
rowsRef.current = []
setFileName('')
setRowCount(0)
setCsvAttachmentCount(0)
}

async function handleFileChange(e) {
const file = e.target.files?.[0]

resetCsv()
setMessage('')
setError('')
setProgressText('')
setProgressPercent(0)

if (!file) return

try {
setProgressText('Membaca CSV...')
setProgressPercent(5)

const text = await file.text()
await wait(50)

const parsed = parseCsv(text)
const normalized = normalizeBlastRows(parsed)

if (normalized.length > MAX_ROWS) {
throw new Error('Maksimal import adalah ' + MAX_ROWS + ' baris. Pecah CSV menjadi beberapa file.')
}

rowsRef.current = normalized

const countAttachment = normalized.filter((row) => row.attachment_url).length

setFileName(file.name)
setRowCount(normalized.length)
setCsvAttachmentCount(countAttachment)
setMessage('CSV terbaca: ' + normalized.length + ' baris.')
setProgressText('')
setProgressPercent(0)
} catch (err) {
resetCsv()
setError(err.message || 'Gagal membaca CSV.')
setProgressText('')
setProgressPercent(0)
} finally {
e.target.value = ''
}
}

function handleAttachUrl() {
setMessage('')
setError('')

const cleanUrl = String(attachmentUrlInput || '').trim()

if (!cleanUrl) {
setError('URL attachment wajib diisi.')
return
}

if (!isValidUrl(cleanUrl)) {
setError('URL attachment tidak valid. Harus diawali http:// atau https://')
return
}

const attachmentType =
attachmentTypeInput === 'auto'
? guessAttachmentType(cleanUrl)
: attachmentTypeInput

const attachmentFilename = guessFileName(cleanUrl)

setAttachmentMeta({
attachment_url: cleanUrl,
attachment_type: attachmentType,
attachment_filename: attachmentFilename,
attachment_caption: attachmentCaptionInput || attachmentFilename
})

setShowAttachBox(false)
setMessage('Attachment URL siap: ' + attachmentFilename)
}

async function handleImport(e) {
e.preventDefault()

if (loading) return

setLoading(true)
setMessage('')
setError('')
setProgressText('Menyiapkan import...')
setProgressPercent(3)

await wait(100)

try {
const rows = rowsRef.current || []

if (!databaseName.trim()) {
throw new Error('Nama database wajib diisi.')
}

if (!rows.length) {
throw new Error('CSV belum dipilih atau kosong.')
}

if (rows.length > MAX_ROWS) {
throw new Error('Maksimal import adalah ' + MAX_ROWS + ' baris.')
}

setProgressText('Membuat database kontak...')
setProgressPercent(8)
await wait(100)

const databaseResponse = await fetchWithTimeout(
'/api/contacts/create-import-database',
{
method: 'POST',
headers: {
'Content-Type': 'application/json'
},
body: JSON.stringify({
databaseName: databaseName.trim(),
type: 'blast',

default_attachment_url: attachmentMeta?.attachment_url || '',
default_attachment_type: attachmentMeta?.attachment_type || '',
default_attachment_filename: attachmentMeta?.attachment_filename || '',
default_attachment_caption: attachmentMeta?.attachment_caption || ''
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
const totalChunk = Math.ceil(rows.length / IMPORT_CHUNK_SIZE_SAFE)

for (let i = 0; i < rows.length; i += IMPORT_CHUNK_SIZE_SAFE) {
const currentChunk = Math.floor(i / IMPORT_CHUNK_SIZE_SAFE) + 1
const chunk = rows.slice(i, i + IMPORT_CHUNK_SIZE_SAFE)

const percent = 10 + Math.round((currentChunk / totalChunk) * 88)

setProgressText('Import chunk ' + currentChunk + ' dari ' + totalChunk + '...')
setProgressPercent(percent)
await wait(80)

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
contacts: chunk
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

await wait(120)
}

setProgressPercent(100)

const defaultAttachmentText = attachmentMeta ? ' Default attachment: 1 URL.' : ''

setMessage(
'Import berhasil: ' +
imported +
' kontak. Skipped: ' +
skipped +
'. Attachment per kontak dari CSV: ' +
withAttachment +
'.' +
defaultAttachmentText
)

rowsRef.current = []
setRowCount(0)
setCsvAttachmentCount(0)
setFileName('')
setAttachmentMeta(null)
setAttachmentUrlInput('')
setAttachmentCaptionInput('')
setProgressText('')
setProgressPercent(0)
} catch (err) {
if (err.name === 'AbortError') {
setError('Request terlalu lama dan dihentikan otomatis. Cek Database Manager apakah data sebagian sudah masuk.')
} else {
setError(err.message || 'Import blast gagal.')
}

setProgressText('')
setProgressPercent(0)
} finally {
setLoading(false)
}
}

const attachmentCount = attachmentMeta ? rowCount : csvAttachmentCount

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
Attachment default untuk semua kontak
</p>
<p className="mt-1 text-xs text-slate-500">
Pakai URL file agar import tidak freeze. URL disimpan 1x di database.
</p>

{attachmentMeta ? (
<p className="mt-2 break-all text-xs font-semibold text-indigo-700">
Attachment siap: {attachmentMeta.attachment_filename}
</p>
) : null}
</div>

<div className="flex gap-2">
<button
type="button"
onClick={() => setShowAttachBox(true)}
disabled={loading}
className="rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
>
Attach File / URL
</button>

{attachmentMeta ? (
<button
type="button"
onClick={() => setAttachmentMeta(null)}
disabled={loading}
className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-red-600 ring-1 ring-red-100 hover:bg-red-50 disabled:bg-slate-100 disabled:text-slate-400"
>
Remove
</button>
) : null}
</div>
</div>

{showAttachBox ? (
<div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-indigo-100">
<label className="mb-2 block text-xs font-bold text-slate-600">
Attachment URL
</label>
<input
value={attachmentUrlInput}
onChange={(e) => setAttachmentUrlInput(e.target.value)}
placeholder="https://..."
className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-600"
/>

<div className="mt-3 grid gap-3 md:grid-cols-2">
<div>
<label className="mb-2 block text-xs font-bold text-slate-600">
Attachment Type
</label>
<select
value={attachmentTypeInput}
onChange={(e) => setAttachmentTypeInput(e.target.value)}
className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-600"
>
<option value="auto">Auto</option>
<option value="image">Image</option>
<option value="document">Document</option>
</select>
</div>

<div>
<label className="mb-2 block text-xs font-bold text-slate-600">
Caption
</label>
<input
value={attachmentCaptionInput}
onChange={(e) => setAttachmentCaptionInput(e.target.value)}
placeholder="Opsional"
className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-600"
/>
</div>
</div>

<div className="mt-4 flex gap-2">
<button
type="button"
onClick={handleAttachUrl}
className="rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700"
>
Simpan Attachment URL
</button>

<button
type="button"
onClick={() => setShowAttachBox(false)}
className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
>
Batal
</button>
</div>
</div>
) : null}
</div>

{rowCount > 0 ? (
<div className="rounded-2xl border border-slate-200 bg-white p-4">
<p className="text-sm font-semibold text-slate-700">
Preview: {rowCount} baris
</p>
<p className="mt-1 text-xs text-slate-500">
Dengan attachment: {attachmentCount} baris
</p>
<p className="mt-1 text-xs text-slate-400">
Import berjalan per {IMPORT_CHUNK_SIZE_SAFE} baris.
</p>
</div>
) : null}

<button
type="submit"
disabled={loading}
className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
>
{loading ? 'Importing...' : 'Import Blast'}
</button>

{progressText ? (
<div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
<div className="mb-2 flex items-center justify-between gap-3">
<span>{progressText}</span>
<span className="font-bold">{progressPercent}%</span>
</div>
<div className="h-3 overflow-hidden rounded-full bg-blue-100">
<div
className="h-full rounded-full bg-blue-600 transition-all"
style={{ width: progressPercent + '%' }}
/>
</div>
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