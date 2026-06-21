

import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

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

function getValue(row, keys) {
for (const key of keys) {
if (row && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
return row[key]
}
}

return ''
}

function safeJsonParse(value) {
if (!value) return null

if (typeof value === 'object') return value

try {
return JSON.parse(String(value))
} catch (err) {
return null
}
}

function findDeepText(payload) {
if (!payload || typeof payload !== 'object') return ''

const directPaths = [
payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body,
payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.button?.text,
payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.interactive?.button_reply?.title,
payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.interactive?.list_reply?.title,
payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.image?.caption,
payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.document?.caption,
payload?.messages?.[0]?.text?.body,
payload?.messages?.[0]?.button?.text,
payload?.messages?.[0]?.interactive?.button_reply?.title,
payload?.messages?.[0]?.interactive?.list_reply?.title,
payload?.messages?.[0]?.image?.caption,
payload?.messages?.[0]?.document?.caption,
payload?.text?.body,
payload?.button?.text,
payload?.interactive?.button_reply?.title,
payload?.interactive?.list_reply?.title,
payload?.image?.caption,
payload?.document?.caption,
payload?.body,
payload?.message,
payload?.text
]

for (const value of directPaths) {
const text = cleanText(value)
if (text) return text
}

return ''
}

function findDeepPhone(payload) {
if (!payload || typeof payload !== 'object') return ''

const directPaths = [
payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from,
payload?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id,
payload?.messages?.[0]?.from,
payload?.contacts?.[0]?.wa_id,
payload?.from,
payload?.wa_id,
payload?.phone
]

for (const value of directPaths) {
const phone = cleanPhone(value)
if (phone) return phone
}

return ''
}

function findDeepName(payload) {
if (!payload || typeof payload !== 'object') return ''

const directPaths = [
payload?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name,
payload?.contacts?.[0]?.profile?.name,
payload?.profile?.name,
payload?.profile_name,
payload?.name
]

for (const value of directPaths) {
const text = cleanText(value)
if (text) return text
}

return ''
}

function normalizeIncomingMessage(row) {
const payload =
safeJsonParse(row?.payload) ||
safeJsonParse(row?.raw_payload) ||
safeJsonParse(row?.webhook_payload) ||
safeJsonParse(row?.message_payload) ||
safeJsonParse(row?.data) ||
safeJsonParse(row?.raw) ||
null

const rawId = cleanText(
getValue(row, [
'id',
'message_id',
'whatsapp_message_id',
'wa_message_id',
'meta_message_id'
])
)

const phone =
cleanPhone(
getValue(row, [
'phone',
'from',
'wa_id',
'wa_phone',
'sender_phone',
'customer_phone',
'contact_phone',
'from_phone'
])
) || findDeepPhone(payload)

const profileName =
cleanText(
getValue(row, [
'profile_name',
'name',
'sender_name',
'contact_name',
'customer_name'
])
) || findDeepName(payload)

const message =
cleanText(
getValue(row, [
'message',
'text',
'body',
'content',
'caption',
'media_caption',
'message_text',
'text_body',
'message_body'
])
) || findDeepText(payload)

const direction = cleanText(
getValue(row, [
'direction',
'message_direction',
'type'
])
).toLowerCase()

const createdAt =
getValue(row, [
'created_at',
'timestamp',
'received_at',
'message_created_at'
]) || new Date().toISOString()

return {
source_message_id: 'wa_incoming_messages:' + rawId,
raw_id: rawId,
phone,
profile_name: profileName,
message,
direction,
created_at: createdAt
}
}

function isIncomingMessage(message) {
const direction = cleanText(message.direction).toLowerCase()

if (!message.phone || !message.message) return false

if (!direction) return true
if (direction.includes('out')) return false
if (direction.includes('sent')) return false

return true
}

function classifyReply(text) {
const message = cleanText(text).toLowerCase()

const negativePhrases = [
'tidak berminat',
'tidak minat',
'ga minat',
'gak minat',
'nggak minat',
'enggak minat',
'tidak tertarik',
'ga tertarik',
'gak tertarik',
'jangan kirim',
'jangan chat',
'stop',
'unsubscribe',
'batal',
'cancel'
]

for (const phrase of negativePhrases) {
if (message.includes(phrase)) {
return {
category: 'not_interested',
sentiment: 'negative',
intent: 'not_interested'
}
}
}

const interestedKeywords = [
'berminat',
'minat',
'mau',
'mau vaksin',
'vaksin',
'vaksinasi',
'boleh',
'info',
'lanjut',
'ya',
'iya',
'y',
'ok',
'oke',
'okay',
'tertarik',
'daftar',
'ikut',
'booking',
'jadwal',
'harga',
'biaya',
'minta',
'kirim',
'setuju',
'deal',
'confirm',
'konfirmasi',
'ambil',
'pesan'
]

for (const keyword of interestedKeywords) {
if (message === keyword || message.includes(keyword)) {
return {
category: 'interested',
sentiment: 'positive',
intent: 'interested'
}
}
}

const notInterestedKeywords = [
'tidak',
'nggak',
'enggak',
'belum',
'nanti',
'skip',
'jangan',
'hapus',
'salah nomor'
]

for (const keyword of notInterestedKeywords) {
if (message === keyword || message.includes(keyword)) {
return {
category: 'not_interested',
sentiment: 'negative',
intent: 'not_interested'
}
}
}

return {
category: 'neutral',
sentiment: 'neutral',
intent: 'neutral'
}
}

async function loadIncomingMessages() {
const { data, error } = await supabaseAdmin
.from('wa_incoming_messages')
.select('*')
.order('created_at', { ascending: false })
.limit(500)

if (error) {
throw new Error(error.message)
}

return Array.isArray(data) ? data : []
}

async function findLatestSentItem(phone) {
const clean = cleanPhone(phone)

if (!clean) return null

const { data, error } = await supabaseAdmin
.from('send_job_items')
.select('id, job_id, phone, message, status, processed_at, created_at, send_jobs:job_id (id, database_id, type)')
.eq('phone', clean)
.eq('status', 'sent')
.order('processed_at', { ascending: false, nullsFirst: false })
.order('created_at', { ascending: false })
.limit(1)

if (!error && Array.isArray(data) && data.length) {
return data[0]
}

const { data: fallbackData } = await supabaseAdmin
.from('send_job_items')
.select('id, job_id, phone, message, status, processed_at, created_at, send_jobs:job_id (id, database_id, type)')
.eq('status', 'sent')
.order('processed_at', { ascending: false, nullsFirst: false })
.order('created_at', { ascending: false })
.limit(1000)

if (!Array.isArray(fallbackData)) return null

return fallbackData.find((item) => cleanPhone(item.phone) === clean) || null
}

async function saveToTable(tableName, payload) {
await supabaseAdmin
.from(tableName)
.delete()
.eq('source_message_id', payload.source_message_id)

const { error } = await supabaseAdmin
.from(tableName)
.insert(payload)

if (error) {
return {
success: false,
message: error.message
}
}

return {
success: true
}
}

async function saveAnalysis(message, classification, matchedItem) {
const job = matchedItem?.send_jobs || null

const payload = {
source_message_id: message.source_message_id,
phone: message.phone,
profile_name: message.profile_name || null,
message: message.message,
category: classification.category,
sentiment: classification.sentiment,
intent: classification.intent,
job_id: matchedItem?.job_id || null,
database_id: job?.database_id || null,
send_job_item_id: matchedItem?.id || null,
message_created_at: message.created_at || null,
updated_at: new Date().toISOString()
}

const replyResult = await saveToTable('reply_analysis', payload)
const waResult = await saveToTable('wa_message_analysis', payload)

return {
payload,
reply_result: replyResult,
wa_result: waResult
}
}

export default async function handler(req, res) {
res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
res.setHeader('Pragma', 'no-cache')
res.setHeader('Expires', '0')

try {
const authUser = await requireRole(req, res, ['master', 'admin', 'user', 'agent'])
if (!authUser) return

if (req.method !== 'POST' && req.method !== 'GET') {
return res.status(405).json({
success: false,
message: 'Method not allowed'
})
}

const rows = await loadIncomingMessages()

const messages = rows
.map(normalizeIncomingMessage)
.filter(isIncomingMessage)

let analyzed = 0
let interested = 0
let notInterested = 0
let neutral = 0
const results = []

for (const message of messages) {
const classification = classifyReply(message.message)
const matchedItem = await findLatestSentItem(message.phone)
const saved = await saveAnalysis(message, classification, matchedItem)

analyzed += 1

if (classification.category === 'interested') interested += 1
else if (classification.category === 'not_interested') notInterested += 1
else neutral += 1

results.push({
phone: message.phone,
message: message.message,
category: classification.category,
job_id: saved.payload.job_id,
database_id: saved.payload.database_id,
reply_saved: saved.reply_result.success,
wa_saved: saved.wa_result.success,
reply_error: saved.reply_result.message || null,
wa_error: saved.wa_result.message || null
})
}

return res.status(200).json({
success: true,
source_table: 'wa_incoming_messages',
total_inbox_rows: rows.length,
normalized_messages: messages.length,
analyzed,
interested,
not_interested: notInterested,
neutral,
latest_results: results.slice(0, 30)
})
} catch (error) {
return res.status(500).json({
success: false,
message: error.message || 'Analyze inbox gagal.'
})
}
}