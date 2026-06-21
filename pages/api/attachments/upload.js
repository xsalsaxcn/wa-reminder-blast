

import { randomUUID } from 'crypto'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export const config = {
api: {
bodyParser: {
sizeLimit: '2mb'
}
}
}

const BUCKET_NAME = 'wa-attachments'
const MAX_FILE_SIZE = 1 * 1024 * 1024

function cleanFileName(fileName) {
const raw = String(fileName || 'attachment').trim()
const allowed = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.() '

let result = ''

for (const char of raw) {
if (allowed.includes(char)) {
result += char
} else {
result += '_'
}
}

while (result.includes(' ')) {
result = result.split(' ').join(' ')
}

while (result.includes('')) {
result = result.split('').join('_')
}

result = result.trim().split(' ').join('_').slice(0, 120)

return result || 'attachment'
}

function parseBase64(base64) {
const text = String(base64 || '')

if (text.includes(',')) {
return text.split(',').pop()
}

return text
}

function getAttachmentType(mimeType) {
if (String(mimeType || '').startsWith('image/')) {
return 'image'
}

return 'document'
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

function withTimeout(promise, ms) {
return Promise.race([
promise,
new Promise((resolve) => {
setTimeout(() => {
resolve({
timeout: true,
error: {
message: 'Upload timeout. Server terlalu lama merespons.'
}
})
}, ms)
})
])
}

export default async function handler(req, res) {
res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
res.setHeader('Pragma', 'no-cache')
res.setHeader('Expires', '0')

try {
await requireRole(req, res, ['master', 'admin', 'user', 'agent'])

if (req.method !== 'POST') {
return res.status(405).json({
success: false,
message: 'Method not allowed'
})
}

const { fileName, mimeType, base64 } = req.body || {}

const cleanMimeType = String(mimeType || '').trim().toLowerCase()
const cleanName = cleanFileName(fileName)

if (!validateMimeType(cleanMimeType)) {
return res.status(400).json({
success: false,
message: 'Format file belum didukung. Gunakan JPG, PNG, WEBP, PDF, DOC/DOCX, atau XLS/XLSX.'
})
}

const buffer = Buffer.from(parseBase64(base64), 'base64')

if (!buffer.length) {
return res.status(400).json({
success: false,
message: 'File kosong.'
})
}

if (buffer.length > MAX_FILE_SIZE) {
return res.status(400).json({
success: false,
message: 'Ukuran file terlalu besar. Maksimal attachment adalah 1 MB.'
})
}

const date = new Date()
const folder =
date.getFullYear() +
'-' +
String(date.getMonth() + 1).padStart(2, '0') +
'-' +
String(date.getDate()).padStart(2, '0')

const path = folder + '/' + randomUUID() + '-' + cleanName

const uploadResult = await withTimeout(
supabaseAdmin.storage
.from(BUCKET_NAME)
.upload(path, buffer, {
contentType: cleanMimeType,
upsert: false
}),
15000
)

if (uploadResult.timeout) {
return res.status(504).json({
success: false,
message: 'Upload terlalu lama. Coba ulangi. Jika masih gagal, pastikan bucket wa-attachments sudah dibuat di Supabase Storage.'
})
}

if (uploadResult.error) {
return res.status(500).json({
success: false,
message: uploadResult.error.message || 'Upload ke storage gagal.'
})
}

const { data: publicData } = supabaseAdmin.storage
.from(BUCKET_NAME)
.getPublicUrl(path)

return res.status(200).json({
success: true,
attachment_url: publicData.publicUrl,
attachment_type: getAttachmentType(cleanMimeType),
attachment_filename: cleanName,
mime_type: cleanMimeType,
path
})
} catch (error) {
return res.status(500).json({
success: false,
message: error.message || 'Upload attachment gagal.'
})
}
}