

import { randomUUID } from 'crypto'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export const config = {
api: {
bodyParser: false
}
}

const BUCKET_NAME = 'wa-attachments'
const MAX_FILE_SIZE = 1 * 1024 * 1024
const MAX_REQUEST_SIZE = 2 * 1024 * 1024

function cleanFileName(fileName) {
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

function getFolderName() {
const date = new Date()

return (
date.getFullYear() +
'-' +
String(date.getMonth() + 1).padStart(2, '0') +
'-' +
String(date.getDate()).padStart(2, '0')
)
}

function validateMimeType(mimeType) {
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

function getAttachmentType(mimeType) {
if (String(mimeType || '').startsWith('image/')) return 'image'
return 'document'
}

function readRawBody(req) {
return new Promise((resolve, reject) => {
const chunks = []
let total = 0

req.on('data', (chunk) => {
total += chunk.length

if (total > MAX_REQUEST_SIZE) {
reject(new Error('Ukuran request terlalu besar. Maksimal attachment adalah 1 MB.'))
return
}

chunks.push(chunk)
})

req.on('end', () => {
resolve(Buffer.concat(chunks))
})

req.on('error', (error) => {
reject(error)
})
})
}

function getBoundary(contentType) {
const parts = String(contentType || '').split(';')

for (const part of parts) {
const trimmed = part.trim()

if (trimmed.startsWith('boundary=')) {
return trimmed.slice('boundary='.length)
}
}

return ''
}

function parseMultipartFile(buffer, boundary) {
const bodyText = buffer.toString('latin1')
const fileMarkerIndex = bodyText.indexOf('name="file"')

if (fileMarkerIndex === -1) {
throw new Error('Field file tidak ditemukan.')
}

const boundaryText = '--' + boundary
const partStart = bodyText.lastIndexOf(boundaryText, fileMarkerIndex)
const headerEnd = bodyText.indexOf('\r\n\r\n', fileMarkerIndex)

if (partStart === -1 || headerEnd === -1) {
throw new Error('Format multipart tidak valid.')
}

const headersText = bodyText.slice(partStart, headerEnd)
const contentStart = headerEnd + 4
const nextBoundary = bodyText.indexOf('\r\n' + boundaryText, contentStart)

if (nextBoundary === -1) {
throw new Error('Akhir file tidak ditemukan.')
}

const fileContentText = bodyText.slice(contentStart, nextBoundary)
const fileBuffer = Buffer.from(fileContentText, 'latin1')

const filenameMatch = headersText.match(/filename="([^"])"/i)
const contentTypeMatch = headersText.match(/content-type:\s([^\r\n]+)/i)

const originalFileName = filenameMatch ? filenameMatch[1] : 'attachment'
const mimeType = contentTypeMatch ? contentTypeMatch[1].trim().toLowerCase() : ''

return {
fileBuffer,
fileName: cleanFileName(originalFileName),
mimeType
}
}

function withTimeout(promise, ms, message) {
return Promise.race([
promise,
new Promise((resolve) => {
setTimeout(() => {
resolve({
timeout: true,
error: {
message
}
})
}, ms)
})
])
}

function sendIframeResult(res, payload) {
const safePayload = JSON.stringify(payload).replace(/</g, '\u003c')

res.setHeader('Content-Type', 'text/html; charset=utf-8')
res.status(200).send(
'<!doctype html><html><body><script>window.parent.postMessage(' +
safePayload +
', window.location.origin);</script></body></html>'
)
}

export default async function handler(req, res) {
res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
res.setHeader('Pragma', 'no-cache')
res.setHeader('Expires', '0')

try {
const authUser = await requireRole(req, res, ['master', 'admin', 'user', 'agent'])
if (!authUser) return

if (req.method !== 'POST') {
return sendIframeResult(res, {
type: 'notiva-attachment-upload',
success: false,
message: 'Method not allowed'
})
}

const contentType = String(req.headers['content-type'] || '')
const boundary = getBoundary(contentType)

if (!boundary) {
return sendIframeResult(res, {
type: 'notiva-attachment-upload',
success: false,
message: 'Boundary upload tidak ditemukan.'
})
}

const rawBody = await readRawBody(req)
const parsed = parseMultipartFile(rawBody, boundary)

if (!parsed.fileBuffer.length) {
return sendIframeResult(res, {
type: 'notiva-attachment-upload',
success: false,
message: 'File kosong.'
})
}

if (parsed.fileBuffer.length > MAX_FILE_SIZE) {
return sendIframeResult(res, {
type: 'notiva-attachment-upload',
success: false,
message: 'Ukuran file terlalu besar. Maksimal attachment adalah 1 MB.'
})
}

if (!validateMimeType(parsed.mimeType)) {
return sendIframeResult(res, {
type: 'notiva-attachment-upload',
success: false,
message: 'Format file belum didukung. Gunakan JPG, PNG, WEBP, PDF, DOC/DOCX, atau XLS/XLSX.'
})
}

const path = getFolderName() + '/' + randomUUID() + '-' + parsed.fileName

const uploadResult = await withTimeout(
supabaseAdmin.storage
.from(BUCKET_NAME)
.upload(path, parsed.fileBuffer, {
contentType: parsed.mimeType,
upsert: false
}),
15000,
'Upload ke Supabase Storage terlalu lama.'
)

if (uploadResult.timeout) {
return sendIframeResult(res, {
type: 'notiva-attachment-upload',
success: false,
message: uploadResult.error.message
})
}

if (uploadResult.error) {
return sendIframeResult(res, {
type: 'notiva-attachment-upload',
success: false,
message: uploadResult.error.message || 'Upload attachment gagal.'
})
}

const { data } = supabaseAdmin.storage
.from(BUCKET_NAME)
.getPublicUrl(path)

return sendIframeResult(res, {
type: 'notiva-attachment-upload',
success: true,
attachment: {
attachment_url: data.publicUrl,
attachment_type: getAttachmentType(parsed.mimeType),
attachment_filename: parsed.fileName,
mime_type: parsed.mimeType,
path
}
})
} catch (error) {
return sendIframeResult(res, {
type: 'notiva-attachment-upload',
success: false,
message: error.message || 'Upload attachment gagal.'
})
}
}