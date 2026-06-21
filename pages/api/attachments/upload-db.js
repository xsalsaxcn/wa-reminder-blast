

import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export const config = {
api: {
bodyParser: false
}
}

const MAX_FILE_SIZE = 1 * 1024 * 1024

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

function getBaseUrl(req) {
const proto = req.headers['x-forwarded-proto'] || 'https'
const host = req.headers['x-forwarded-host'] || req.headers.host

return proto + '://' + host
}

function readRawBody(req) {
return new Promise((resolve, reject) => {
const chunks = []
let total = 0
let stopped = false

req.on('data', (chunk) => {
if (stopped) return

total += chunk.length

if (total > MAX_FILE_SIZE) {
stopped = true
reject(new Error('Ukuran file terlalu besar. Maksimal attachment adalah 1 MB.'))
req.destroy()
return
}

chunks.push(chunk)
})

req.on('end', () => {
if (stopped) return
resolve(Buffer.concat(chunks))
})

req.on('error', (error) => {
if (stopped) return
reject(error)
})
})
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

export default async function handler(req, res) {
res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
res.setHeader('Pragma', 'no-cache')
res.setHeader('Expires', '0')

try {
const authUser = await requireRole(req, res, ['master', 'admin', 'user', 'agent'])
if (!authUser) return

if (req.method !== 'POST') {
return res.status(405).json({
success: false,
message: 'Method not allowed'
})
}

const mimeType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
const rawFileName = String(req.headers['x-file-name'] || 'attachment')
const fileName = cleanFileName(decodeURIComponent(rawFileName))

if (!validateMimeType(mimeType)) {
return res.status(400).json({
success: false,
message: 'Format file belum didukung. Gunakan JPG, PNG, WEBP, PDF, DOC/DOCX, atau XLS/XLSX.'
})
}

const contentLength = Number(req.headers['content-length'] || 0)

if (contentLength > MAX_FILE_SIZE) {
return res.status(400).json({
success: false,
message: 'Ukuran file terlalu besar. Maksimal attachment adalah 1 MB.'
})
}

const buffer = await readRawBody(req)

if (!buffer || !buffer.length) {
return res.status(400).json({
success: false,
message: 'File kosong.'
})
}

const insertResult = await withTimeout(
supabaseAdmin
.from('wa_attachments')
.insert({
file_name: fileName,
mime_type: mimeType,
size_bytes: buffer.length,
data_base64: buffer.toString('base64')
})
.select('id, file_name, mime_type, size_bytes')
.single(),
10000,
'Upload attachment ke database terlalu lama.'
)

if (insertResult.timeout) {
return res.status(504).json({
success: false,
message: insertResult.error.message
})
}

if (insertResult.error) {
return res.status(500).json({
success: false,
message: insertResult.error.message || 'Upload attachment gagal.'
})
}

const attachment = insertResult.data
const attachmentUrl = getBaseUrl(req) + '/api/public/attachments/' + attachment.id

return res.status(200).json({
success: true,
attachment_url: attachmentUrl,
attachment_type: getAttachmentType(mimeType),
attachment_filename: fileName,
mime_type: mimeType,
id: attachment.id,
size_bytes: buffer.length
})
} catch (error) {
return res.status(500).json({
success: false,
message: error.message || 'Upload attachment gagal.'
})
}
}