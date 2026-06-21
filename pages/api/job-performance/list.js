

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

function toNumber(value) {
const number = Number(value)
if (!Number.isFinite(number)) return 0
return number
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

const values = [
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

for (const value of values) {
const text = cleanText(value)
if (text) return text
}

return ''
}

function findDeepPhone(payload) {
if (!payload || typeof payload !== 'object') return ''

const values = [
payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from,
payload?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id,
payload?.messages?.[0]?.from,
payload?.contacts?.[0]?.wa_id,
payload?.from,
payload?.wa_id,
payload?.phone
]

for (const value of values) {
const phone = cleanPhone(value)
if (phone) return phone
}

return ''
}

function findDeepName(payload) {
if (!payload || typeof payload !== 'object') return ''

const values = [
payload?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name,
payload?.contacts?.[0]?.profile?.name,
payload?.profile?.name,
payload?.profile_name,
payload?.name
]

for (const value of values) {
const text = cleanText(value)
if (text) return text
}

return ''
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
label: 'Tidak Berminat'
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
label: 'Berminat'
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
label: 'Tidak Berminat'
}
}
}

return {
category: 'neutral',
label: 'Netral'
}
}

function normalizeCategory(value, body) {
const label = cleanText(value).toLowerCase()

if (
label.includes('berminat') ||
label.includes('interested') ||
label.includes('positive') ||
label.includes('positif')
) {
return 'interested'
}

if (
label.includes('tidak') ||
label.includes('not') ||
label.includes('negative') ||
label.includes('negatif')
) {
return 'not_interested'
}

if (
label.includes('netral') ||
label.includes('neutral')
) {
return 'neutral'
}

return classifyReply(body).category
}

function getDateValue(value) {
const date = new Date(value || '')
if (Number.isNaN(date.getTime())) return 0
return date.getTime()
}

function isStatus(item, statusList) {
const status = cleanText(item.status).toLowerCase()
return statusList.includes(status)
}

function getJobName(job, databaseMap) {
return (
cleanText(job.name) ||
cleanText(job.title) ||
cleanText(job.job_name) ||
cleanText(databaseMap.get(job.database_id)?.name) ||
'Campaign'
)
}

function normalizeAnalysisRow(row) {
const incomingId = cleanText(
getValue(row, [
'incoming_message_id',
'source_message_id',
'message_id',
'wa_message_id'
])
)

const id = cleanText(row.id)

const body = cleanText(
getValue(row, [
'body',
'message',
'text',
'content',
'caption'
])
)

const label = cleanText(
getValue(row, [
'label',
'category',
'intent',
'sentiment',
'classification'
])
)

return {
id,
source_message_id: incomingId
? 'wa_incoming_messages:' + incomingId
: 'wa_message_analysis:' + id,
phone: cleanPhone(
getValue(row, [
'phone',
'wa_id',
'sender_phone',
'customer_phone'
])
),
profile_name: cleanText(
getValue(row, [
'profile_name',
'name',
'sender_name',
'contact_name'
])
),
message: body,
label,
category: normalizeCategory(label, body),
job_id: cleanText(row.job_id),
database_id: cleanText(row.database_id),
send_job_item_id: cleanText(row.send_job_item_id),
received_at:
getValue(row, [
'received_at',
'message_created_at',
'created_at',
'updated_at'
]) || null
}
}

function normalizeIncomingRow(row) {
const payload =
safeJsonParse(row?.payload) ||
safeJsonParse(row?.raw_payload) ||
safeJsonParse(row?.webhook_payload) ||
safeJsonParse(row?.message_payload) ||
safeJsonParse(row?.data) ||
safeJsonParse(row?.raw) ||
null

const id = cleanText(
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

const body =
cleanText(
getValue(row, [
'body',
'message',
'text',
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

const date =
getValue(row, [
'received_at',
'created_at',
'timestamp',
'message_created_at'
]) || null

const classification = classifyReply(body)

return {
id,
source_message_id: 'wa_incoming_messages:' + id,
phone,
profile_name: profileName,
message: body,
label: classification.label,
category: classification.category,
job_id: '',
database_id: '',
send_job_item_id: '',
received_at: date,
direction
}
}

function isIncomingMessage(row) {
const direction = cleanText(row.direction).toLowerCase()

if (!row.phone || !row.message) return false

if (!direction) return true
if (direction.includes('out')) return false
if (direction.includes('sent')) return false

return true
}

function dedupeReplies(replies) {
const map = new Map()

for (const reply of replies) {
const key =
cleanText(reply.source_message_id) ||
cleanText(reply.id) ||
cleanPhone(reply.phone) + ':' + cleanText(reply.message) + ':' + cleanText(reply.received_at)

map.set(key, reply)
}

return Array.from(map.values())
}

async function loadTable(tableName, limit = 5000) {
const { data, error } = await supabaseAdmin
.from(tableName)
.select('*')
.limit(limit)

if (error) {
return {
rows: [],
error: error.message
}
}

return {
rows: Array.isArray(data) ? data : [],
error: null
}
}

async function loadReplies() {
const analysisResult = await loadTable('wa_message_analysis', 5000)
const incomingResult = await loadTable('wa_incoming_messages', 5000)

const analysisRows = analysisResult.rows.map(normalizeAnalysisRow)
const incomingRows = incomingResult.rows
.map(normalizeIncomingRow)
.filter(isIncomingMessage)

const replies = dedupeReplies([
...analysisRows,
...incomingRows
])

replies.sort((a, b) => {
return getDateValue(b.received_at) - getDateValue(a.received_at)
})

return {
replies,
debug: {
wa_message_analysis_rows: analysisResult.rows.length,
wa_message_analysis_error: analysisResult.error,
wa_incoming_messages_rows: incomingResult.rows.length,
wa_incoming_messages_error: incomingResult.error,
normalized_replies: replies.length
}
}
}

function replyBelongsToJob(reply, job, jobItems) {
if (cleanText(reply.job_id) && cleanText(reply.job_id) === cleanText(job.id)) {
return true
}

if (cleanText(reply.database_id) && cleanText(reply.database_id) === cleanText(job.database_id)) {
return true
}

const replyPhone = cleanPhone(reply.phone)
if (!replyPhone) return false

return jobItems.some((item) => {
const itemPhone = cleanPhone(item.phone)
if (!itemPhone || itemPhone !== replyPhone) return false

const replyDate = getDateValue(reply.received_at)
const itemDate = getDateValue(item.processed_at || item.sent_at || item.updated_at || item.created_at)

if (!replyDate || !itemDate) return true

return replyDate >= itemDate - 60 * 60 * 1000
})
}

function countCategory(replies, category) {
return replies.filter((reply) => cleanText(reply.category).toLowerCase() === category).length
}

export default async function handler(req, res) {
res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
res.setHeader('Pragma', 'no-cache')
res.setHeader('Expires', '0')

try {
const authUser = await requireRole(req, res, ['master', 'admin', 'user', 'agent'])
if (!authUser) return

if (req.method !== 'GET') {
return res.status(405).json({
success: false,
message: 'Method not allowed'
})
}

const { search = '', type = '', status = '', start = '', end = '' } = req.query || {}

const jobsResult = await supabaseAdmin
.from('send_jobs')
.select('*')
.order('created_at', { ascending: false })
.limit(200)

if (jobsResult.error) {
return res.status(500).json({
success: false,
message: jobsResult.error.message
})
}

let jobs = Array.isArray(jobsResult.data) ? jobsResult.data : []

if (type) {
jobs = jobs.filter((job) => cleanText(job.type).toLowerCase() === cleanText(type).toLowerCase())
}

if (status) {
jobs = jobs.filter((job) => cleanText(job.status).toLowerCase() === cleanText(status).toLowerCase())
}

if (start) {
const startTime = getDateValue(start)
jobs = jobs.filter((job) => getDateValue(job.created_at) >= startTime)
}

if (end) {
const endTime = getDateValue(end) + 24 * 60 * 60 * 1000
jobs = jobs.filter((job) => getDateValue(job.created_at) <= endTime)
}

const jobIds = jobs.map((job) => job.id).filter(Boolean)
const databaseIds = jobs.map((job) => job.database_id).filter(Boolean)

let databases = []
let items = []

if (databaseIds.length) {
const databaseResult = await supabaseAdmin
.from('contact_databases')
.select('*')
.in('id', databaseIds)

databases = Array.isArray(databaseResult.data) ? databaseResult.data : []
}

if (jobIds.length) {
const itemsResult = await supabaseAdmin
.from('send_job_items')
.select('*')
.in('job_id', jobIds)
.limit(10000)

items = Array.isArray(itemsResult.data) ? itemsResult.data : []
}

const repliesResult = await loadReplies()
const allReplies = repliesResult.replies

const databaseMap = new Map(databases.map((database) => [database.id, database]))

let rows = jobs.map((job) => {
const jobItems = items.filter((item) => cleanText(item.job_id) === cleanText(job.id))
const jobReplies = allReplies.filter((reply) => replyBelongsToJob(reply, job, jobItems))

const total =
jobItems.length ||
toNumber(job.total_items) ||
toNumber(job.total) ||
toNumber(job.total_contacts)

const sent = jobItems.filter((item) => isStatus(item, ['sent', 'delivered', 'read', 'success', 'completed'])).length
const failed = jobItems.filter((item) => isStatus(item, ['failed', 'error', 'cancelled'])).length
const pending = jobItems.filter((item) => isStatus(item, ['pending', 'queued', 'processing'])).length

const interested = countCategory(jobReplies, 'interested')
const notInterested = countCategory(jobReplies, 'not_interested')
const neutral = countCategory(jobReplies, 'neutral')
const replies = jobReplies.length

return {
job_id: job.id,
id: job.id,
job_name: getJobName(job, databaseMap),
name: getJobName(job, databaseMap),
database_name: cleanText(databaseMap.get(job.database_id)?.name) || '-',
database_id: job.database_id,
type: job.type || '-',
status: job.status || '-',
created_at: job.created_at,
total,
total_items: total,
sent,
failed,
pending,
replies,
reply_count: replies,
interested,
interested_count: interested,
not_interested: notInterested,
not_interested_count: notInterested,
neutral,
neutral_count: neutral,
response_rate: sent > 0 ? Math.round((replies / sent) * 100) : 0
}
})

if (search) {
const q = cleanText(search).toLowerCase()

rows = rows.filter((row) => {
return (
cleanText(row.job_name).toLowerCase().includes(q) ||
cleanText(row.database_name).toLowerCase().includes(q) ||
cleanText(row.type).toLowerCase().includes(q) ||
cleanText(row.status).toLowerCase().includes(q)
)
})
}

const summary = rows.reduce(
(acc, row) => {
acc.total_jobs += 1
acc.total += toNumber(row.total)
acc.sent += toNumber(row.sent)
acc.failed += toNumber(row.failed)
acc.pending += toNumber(row.pending)
acc.replies += toNumber(row.replies)
acc.interested += toNumber(row.interested)
acc.not_interested += toNumber(row.not_interested)
acc.neutral += toNumber(row.neutral)
return acc
},
{
total_jobs: 0,
total: 0,
sent: 0,
failed: 0,
pending: 0,
replies: 0,
interested: 0,
not_interested: 0,
neutral: 0
}
)

return res.status(200).json({
success: true,
items: rows,
rows,
data: rows,
summary,
debug: repliesResult.debug
})
} catch (error) {
return res.status(500).json({
success: false,
message: error.message || 'Gagal load job performance.'
})
}
}