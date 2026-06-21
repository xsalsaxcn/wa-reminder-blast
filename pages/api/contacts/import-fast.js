

import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

const MAX_IMPORT_CONTACTS = 5000
const CHUNK_SIZE = 300

function cleanText(value) {
return String(value || '').trim()
}

function cleanPhone(value) {
let phone = String(value || '').trim()

if (phone.startsWith('="')) {
phone = phone.slice(2)
}

if (phone.endsWith('"')) {
phone = phone.slice(0, -1)
}

if (phone.startsWith("'")) {
phone = phone.slice(1)
}

let result = ''

for (const char of phone) {
if ('0123456789'.includes(char)) {
result += char
}
}

if (result.startsWith('0')) {
result = '62' + result.slice(1)
}

return result
}

function getValue(row, keys) {
for (const key of keys) {
if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
return row[key]
}

const foundKey = Object.keys(row || {}).find(
(item) => String(item || '').trim().toLowerCase() === String(key).trim().toLowerCase()
)

if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== '') {
return row[foundKey]
}
}

return ''
}

function normalizeContact(row, type, databaseId) {
const name = cleanText(getValue(row, ['name', 'nama', 'customer_name', 'profile_name']))
const phone = cleanPhone(getValue(row, ['phone', 'nomor', 'no_hp', 'whatsapp', 'wa', 'number']))
const message = cleanText(getValue(row, ['message', 'pesan', 'text', 'body']))
const reminderDate = cleanText(getValue(row, ['reminder_date', 'tanggal', 'date', 'scheduled_at', 'send_at']))
const attachmentUrl = cleanText(getValue(row, ['attachment_url', 'file_url', 'document_url', 'image_url', 'media_url', 'link_file']))
const attachmentType = cleanText(getValue(row, ['attachment_type', 'file_type', 'media_type'])).toLowerCase()
const attachmentFilename = cleanText(getValue(row, ['attachment_filename', 'filename', 'file_name', 'nama_file']))
const attachmentCaption = cleanText(getValue(row, ['attachment_caption', 'caption', 'file_caption']))

return {
database_id: databaseId,
type,
name,
phone,
message,
reminder_date: reminderDate || null,
attachment_url: attachmentUrl || null,
attachment_type: attachmentType || null,
attachment_filename: attachmentFilename || null,
attachment_caption: attachmentCaption || null
}
}

function withTimeout(promise, ms, label) {
return Promise.race([
promise,
new Promise((resolve) => {
setTimeout(() => {
resolve({
timeout: true,
label
})
}, ms)
})
])
}

async function insertContacts(rows) {
let imported = 0

for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
const chunk = rows.slice(i, i + CHUNK_SIZE)

const result = await withTimeout(
supabaseAdmin
.from('contacts')
.insert(chunk),
12000,
'insert contacts'
)

if (result.timeout) {
throw new Error('Timeout saat insert contacts. Coba import dalam jumlah lebih kecil.')
}

if (result.error) {
throw new Error(result.error.message)
}

imported += chunk.length
}

return imported
}

export default async function handler(req, res) {
res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
res.setHeader('Pragma', 'no-cache')
res.setHeader('Expires', '0')

try {
const authUser = requireRole(req, res, ['master', 'admin', 'user', 'agent'])
if (!authUser) return

if (req.method !== 'POST') {
return res.status(405).json({
success: false,
message: 'Method not allowed'
})
}

const body = req.body || {}
const databaseName = cleanText(body.databaseName || body.database_name || body.name || body.title)
const type = cleanText(body.type || 'blast').toLowerCase()
const contacts = Array.isArray(body.contacts) ? body.contacts : []

if (!databaseName) {
return res.status(400).json({
success: false,
message: 'Nama database wajib diisi.'
})
}

if (type !== 'blast' && type !== 'reminder') {
return res.status(400).json({
success: false,
message: 'Type harus blast atau reminder.'
})
}

if (!contacts.length) {
return res.status(400).json({
success: false,
message: 'Data kontak kosong.'
})
}

if (contacts.length > MAX_IMPORT_CONTACTS) {
return res.status(400).json({
success: false,
message: 'Maksimal import ' + MAX_IMPORT_CONTACTS + ' kontak.'
})
}

const databaseResult = await withTimeout(
supabaseAdmin
.from('contact_databases')
.insert({
name: databaseName,
type
})
.select('id, name, type, created_at')
.single(),
10000,
'create database'
)

if (databaseResult.timeout) {
return res.status(504).json({
success: false,
message: 'Timeout saat membuat database kontak.'
})
}

if (databaseResult.error) {
return res.status(500).json({
success: false,
message: databaseResult.error.message
})
}

const database = databaseResult.data

if (!database || !database.id) {
return res.status(500).json({
success: false,
message: 'Database berhasil dibuat tapi ID tidak ditemukan.'
})
}

const normalizedContacts = contacts
.map((row) => normalizeContact(row, type, database.id))
.filter((row) => row.phone && row.message)

const skipped = contacts.length - normalizedContacts.length

if (!normalizedContacts.length) {
return res.status(400).json({
success: false,
message: 'Tidak ada kontak valid. Pastikan phone dan message terisi.'
})
}

const imported = await insertContacts(normalizedContacts)
const withAttachment = normalizedContacts.filter((row) => row.attachment_url).length

return res.status(200).json({
success: true,
message: 'Import berhasil.',
database,
total: contacts.length,
imported,
skipped,
with_attachment: withAttachment
})
} catch (error) {
return res.status(500).json({
success: false,
message: error.message || 'Import gagal.'
})
}
}