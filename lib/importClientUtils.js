

export const BUCKET_NAME = 'wa-attachments'
export const MAX_FILE_SIZE = 1 * 1024 * 1024
export const IMPORT_CHUNK_SIZE = 100

export function wait(ms) {
return new Promise((resolve) => setTimeout(resolve, ms))
}

function getSupabaseConfig() {
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
throw new Error('Supabase public environment belum lengkap.')
}

return {
url: String(url).replace(//$`/, ''),
key
}
}

export function parseCsv(text) {
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

export function cleanFormulaPhone(value) {
return String(value || '')
.trim()
.replace(/^="/, '')
.replace(/"`$/, '')
.replace(/^'/, '')
}

export function normalizeBlastRows(parsed) {
return parsed.map((row) => ({
name: row.name || row.nama || row.customer_name || '',
phone: cleanFormulaPhone(row.phone || row.nomor || row.no_hp || row.whatsapp || row.wa || ''),
message: row.message || row.pesan || row.text || row.body || '',
attachment_url: row.attachment_url || row.file_url || row.document_url || row.image_url || row.media_url || row.link_file || '',
attachment_type: row.attachment_type || row.file_type || row.media_type || '',
attachment_filename: row.attachment_filename || row.filename || row.file_name || row.nama_file || '',
attachment_caption: row.attachment_caption || row.caption || row.file_caption || ''
}))
}

export function normalizeReminderRows(parsed) {
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

export function combineReminderDateTime(row) {
const date = String(row.reminder_date || '').trim()
const time = String(row.reminder_time || '').trim()

if (!date) return ''
if (date.includes(':')) return date
if (time) return date + ' ' + time

return date
}

export function cleanFileName(fileName) {
const raw = String(fileName || 'attachment').trim()
const allowed = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.() '
let result = ''

for (const char of raw) {
result += allowed.includes(char) ? char : '_'
}

while (result.includes(' ')) result = result.split(' ').join(' ')
while (result.includes('')) result = result.split('').join('_')

result = result.trim().split(' ').join('_').slice(0, 120)

return result || 'attachment'
}

export function makeId() {
if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
return window.crypto.randomUUID()
}

return String(Date.now()) + '-' + String(Math.random()).slice(2)
}

export function getFolderName() {
const date = new Date()

return (
date.getFullYear() +
'-' +
String(date.getMonth() + 1).padStart(2, '0') +
'-' +
String(date.getDate()).padStart(2, '0')
)
}

export function getAttachmentType(mimeType) {
if (String(mimeType || '').startsWith('image/')) return 'image'
return 'document'
}

export function validateMimeType(mimeType) {
const allowed = [
'image/jpeg',
'image/png',
'image/webp',
'application/pdf',
'application/msword',
'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
'application/vnd.ms-excel',
'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]

return allowed.includes(String(mimeType || '').toLowerCase())
}

function encodeStoragePath(path) {
return String(path || '')
.split('/')
.map((part) => encodeURIComponent(part))
.join('/')
}

function uploadFileWithXhr({ uploadUrl, publicUrl, apiKey, file, mimeType }) {
return new Promise((resolve, reject) => {
if (typeof XMLHttpRequest === 'undefined') {
reject(new Error('Browser tidak mendukung XMLHttpRequest.'))
return
}

const xhr = new XMLHttpRequest()

xhr.open('POST', uploadUrl, true)
xhr.timeout = 20000

xhr.setRequestHeader('apikey', apiKey)
xhr.setRequestHeader('authorization', 'Bearer ' + apiKey)
xhr.setRequestHeader('x-upsert', 'false')
xhr.setRequestHeader('content-type', mimeType)

xhr.onload = function () {
if (xhr.status >= 200 && xhr.status < 300) {
resolve({
publicUrl
})
return
}

let message = 'Upload attachment gagal.'

try {
const data = JSON.parse(xhr.responseText || '{}')
message = data.message || data.error || message
} catch (err) {
if (xhr.responseText) {
message = xhr.responseText
}
}

reject(new Error(message))
}

xhr.onerror = function () {
reject(new Error('Upload gagal karena koneksi bermasalah.'))
}

xhr.ontimeout = function () {
reject(new Error('Upload attachment timeout setelah 20 detik.'))
}

xhr.onabort = function () {
reject(new Error('Upload attachment dibatalkan.'))
}

xhr.send(file)
})
}

export async function uploadAttachmentDirect(file) {
const mimeType = String(file.type || '').trim().toLowerCase()

if (!validateMimeType(mimeType)) {
throw new Error('Format file belum didukung. Gunakan JPG, PNG, WEBP, PDF, DOC/DOCX, atau XLS/XLSX.')
}

if (file.size > MAX_FILE_SIZE) {
throw new Error('Ukuran file terlalu besar. Maksimal attachment adalah 1 MB.')
}

const config = getSupabaseConfig()
const cleanName = cleanFileName(file.name)
const path = getFolderName() + '/' + makeId() + '-' + cleanName
const encodedPath = encodeStoragePath(path)

const uploadUrl =
config.url +
'/storage/v1/object/' +
BUCKET_NAME +
'/' +
encodedPath

const publicUrl =
config.url +
'/storage/v1/object/public/' +
BUCKET_NAME +
'/' +
encodedPath

const result = await uploadFileWithXhr({
uploadUrl,
publicUrl,
apiKey: config.key,
file,
mimeType
})

return {
attachment_url: result.publicUrl,
attachment_type: getAttachmentType(mimeType),
attachment_filename: cleanName
}
}

export async function readApiResponse(response) {
const text = await response.text()

try {
return JSON.parse(text)
} catch (err) {
return {
success: false,
message: text || 'Server mengembalikan response non-JSON.'
}
}
}

export async function fetchWithTimeout(url, options, timeoutMs) {
const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), timeoutMs)

try {
return await fetch(url, {
...options,
signal: controller.signal
})
} finally {
clearTimeout(timer)
}
}

export function csvEscape(value) {
const text = String(value ?? '')
return '"' + text.split('"').join('""') + '"'
}

export function downloadCsvFile(filename, headers, rows) {
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