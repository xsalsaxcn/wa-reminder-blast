

import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

const DEFAULT_BATCH_LIMIT = 10
const MAX_BATCH_LIMIT = 100
const INSERT_CHUNK_SIZE = 300

function cleanText(value) {
return String(value || '').trim()
}

function cleanPhone(value) {
let phone = String(value || '').trim()

if (phone.startsWith('="')) phone = phone.slice(2)
if (phone.endsWith('"')) phone = phone.slice(0, -1)
if (phone.startsWith("'")) phone = phone.slice(1)

let result = ''

for (const char of phone) {
if ('0123456789'.includes(char)) result += char
}

if (result.startsWith('0')) result = '62' + result.slice(1)

return result
}

function normalizeBatchLimit(value) {
const number = Number(value || DEFAULT_BATCH_LIMIT)

if (!Number.isFinite(number)) return DEFAULT_BATCH_LIMIT
if (number < 1) return DEFAULT_BATCH_LIMIT
if (number > MAX_BATCH_LIMIT) return MAX_BATCH_LIMIT

return Math.floor(number)
}

function getContactAttachment(contact, database) {
const contactAttachmentUrl = cleanText(contact.attachment_url)
const defaultAttachmentUrl = cleanText(database?.default_attachment_url)
const messageText = cleanText(contact.message)

if (contactAttachmentUrl) {
return {
attachment_url: contactAttachmentUrl,
attachment_type: cleanText(contact.attachment_type) || cleanText(database?.default_attachment_type) || null,
attachment_filename: cleanText(contact.attachment_filename) || cleanText(database?.default_attachment_filename) || null,
attachment_caption: cleanText(contact.attachment_caption) || messageText || cleanText(database?.default_attachment_caption) || null
}
}

if (defaultAttachmentUrl) {
return {
attachment_url: defaultAttachmentUrl,
attachment_type: cleanText(database?.default_attachment_type) || null,
attachment_filename: cleanText(database?.default_attachment_filename) || null,
attachment_caption: messageText || cleanText(database?.default_attachment_caption) || cleanText(database?.default_attachment_filename) || null
}
}

return {
attachment_url: null,
attachment_type: null,
attachment_filename: null,
attachment_caption: null
}
}

function buildJobItem(contact, jobId, database) {
const attachment = getContactAttachment(contact, database)

return {
job_id: jobId,
name: cleanText(contact.name),
phone: cleanPhone(contact.phone),
message: cleanText(contact.message),
status: 'pending',
attachment_url: attachment.attachment_url,
attachment_type: attachment.attachment_type,
attachment_filename: attachment.attachment_filename,
attachment_caption: attachment.attachment_caption
}
}

async function insertItemsInChunks(items) {
let inserted = 0

for (let i = 0; i < items.length; i += INSERT_CHUNK_SIZE) {
const chunk = items.slice(i, i + INSERT_CHUNK_SIZE)

const { error } = await supabaseAdmin
.from('send_job_items')
.insert(chunk)

if (error) throw new Error(error.message)

inserted += chunk.length
}

return inserted
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

const body = req.body || {}

const selectedDatabaseId = cleanText(
body.database_id ||
body.databaseId ||
body.contact_database_id ||
body.contactDatabaseId
)

const type = cleanText(body.type || 'blast').toLowerCase()
const batchLimit = normalizeBatchLimit(body.batch_limit || body.batchLimit)

if (!selectedDatabaseId) {
return res.status(400).json({
success: false,
message: 'database_id wajib diisi.'
})
}

if (type !== 'blast' && type !== 'reminder') {
return res.status(400).json({
success: false,
message: 'Type harus blast atau reminder.'
})
}

const { data: database, error: databaseError } = await supabaseAdmin
.from('contact_databases')
.select(
'id, name, type, default_attachment_url, default_attachment_type, default_attachment_filename, default_attachment_caption'
)
.eq('id', selectedDatabaseId)
.single()

if (databaseError || !database) {
return res.status(404).json({
success: false,
message: databaseError?.message || 'Database kontak tidak ditemukan.'
})
}

const { data: contacts, error: contactsError } = await supabaseAdmin
.from('contacts')
.select(
'id, name, phone, message, reminder_date, attachment_url, attachment_type, attachment_filename, attachment_caption, created_at'
)
.eq('database_id', selectedDatabaseId)
.order('created_at', { ascending: true })

if (contactsError) {
return res.status(500).json({
success: false,
message: contactsError.message
})
}

const validContacts = Array.isArray(contacts)
? contacts.filter((contact) => cleanPhone(contact.phone) && cleanText(contact.message))
: []

if (!validContacts.length) {
return res.status(400).json({
success: false,
message: 'Tidak ada kontak valid untuk dibuat job.'
})
}

const jobName = cleanText(body.name || body.title) || database.name || 'WhatsApp Job'

const { data: job, error: jobError } = await supabaseAdmin
.from('send_jobs')
.insert({
name: jobName,
title: jobName,
type,
database_id: selectedDatabaseId,
status: 'pending',
total_items: validContacts.length,
batch_limit: batchLimit
})
.select('*')
.single()

if (jobError || !job) {
return res.status(500).json({
success: false,
message: jobError?.message || 'Gagal membuat job.'
})
}

const items = validContacts.map((contact) => buildJobItem(contact, job.id, database))
const inserted = await insertItemsInChunks(items)
const withAttachment = items.filter((item) => item.attachment_url).length

return res.status(200).json({
success: true,
message: 'Job berhasil dibuat.',
job,
job_id: job.id,
database,
total_contacts: validContacts.length,
total_items: inserted,
with_attachment: withAttachment,
batch_limit: batchLimit
})
} catch (error) {
return res.status(500).json({
success: false,
message: error.message || 'Gagal membuat job.'
})
}
}