

import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

const MAX_CHUNK_SIZE = 150

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

const databaseId = cleanText(req.body?.databaseId || req.body?.database_id)
const type = cleanText(req.body?.type || 'blast').toLowerCase()
const contacts = Array.isArray(req.body?.contacts) ? req.body.contacts : []

if (!databaseId) {
return res.status(400).json({
success: false,
message: 'databaseId wajib diisi.'
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
message: 'Chunk kontak kosong.'
})
}

if (contacts.length > MAX_CHUNK_SIZE) {
return res.status(400).json({
success: false,
message: 'Maksimal chunk adalah ' + MAX_CHUNK_SIZE + ' kontak.'
})
}

const normalizedContacts = contacts
.map((row) => normalizeContact(row, type, databaseId))
.filter((row) => row.phone && row.message)

const skipped = contacts.length - normalizedContacts.length

if (!normalizedContacts.length) {
return res.status(200).json({
success: true,
imported: 0,
skipped,
with_attachment: 0
})
}

const { error } = await supabaseAdmin
.from('contacts')
.insert(normalizedContacts)

if (error) {
return res.status(500).json({
success: false,
message: error.message
})
}

const withAttachment = normalizedContacts.filter((row) => row.attachment_url).length

return res.status(200).json({
success: true,
imported: normalizedContacts.length,
skipped,
with_attachment: withAttachment
})
} catch (error) {
return res.status(500).json({
success: false,
message: error.message || 'Import chunk gagal.'
})
}
}