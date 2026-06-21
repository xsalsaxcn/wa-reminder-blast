

import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { sendWhatsAppMedia } from '../../../lib/whatsappSender'
import { requireRole } from '../../../lib/auth'

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50

function cleanText(value) {
return String(value || '').trim()
}

function toLimit(value) {
const number = Number(value || DEFAULT_LIMIT)

if (!Number.isFinite(number)) return DEFAULT_LIMIT
if (number < 1) return DEFAULT_LIMIT
if (number > MAX_LIMIT) return MAX_LIMIT

return Math.floor(number)
}

function getJobFromItem(item) {
if (item.send_jobs) return item.send_jobs
if (item.send_jobs?.[0]) return item.send_jobs[0]
return item.job || null
}

async function insertLog({ item, job, status, result, errorMessage }) {
const tableName = job?.type === 'reminder' ? 'reminder_logs' : 'blast_logs'

const payload = {
job_id: item.job_id,
database_id: job?.database_id || null,
name: item.name || null,
phone: item.phone || null,
message: item.message || null,
status,
attachment_url: item.attachment_url || null,
attachment_type: item.attachment_type || null,
attachment_filename: item.attachment_filename || null,
attachment_caption: item.attachment_caption || item.message || null,
meta_message_id: result?.meta_message_id || null,
error_message: errorMessage || null
}

const { error } = await supabaseAdmin
.from(tableName)
.insert(payload)

if (error) {
console.error('insertLog error:', error.message)
}
}

async function updateJobStatus(jobId) {
const { data: items, error } = await supabaseAdmin
.from('send_job_items')
.select('id, status')
.eq('job_id', jobId)

if (error || !Array.isArray(items)) return

const total = items.length
const pending = items.filter((item) => item.status === 'pending' || item.status === 'queued').length
const failed = items.filter((item) => item.status === 'failed').length
const sent = items.filter((item) => item.status === 'sent').length

let status = 'processing'

if (total > 0 && pending === 0) {
status = failed > 0 && sent === 0 ? 'failed' : 'completed'
}

const updatePayload = {
status,
updated_at: new Date().toISOString()
}

if (status === 'completed' || status === 'failed') {
updatePayload.finished_at = new Date().toISOString()
}

await supabaseAdmin
.from('send_jobs')
.update(updatePayload)
.eq('id', jobId)
}

export default async function handler(req, res) {
res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
res.setHeader('Pragma', 'no-cache')
res.setHeader('Expires', '0')

try {
const roleResult = await requireRole(req, res, ['master', 'admin', 'user', 'agent'])
if (!roleResult) return

if (req.method !== 'POST' && req.method !== 'GET') {
return res.status(405).json({
success: false,
message: 'Method not allowed'
})
}

const limit = toLimit(req.query.limit || req.body?.limit)

const { data: items, error } = await supabaseAdmin
.from('send_job_items')
.select(', send_jobs:job_id ()')
.in('status', ['pending', 'queued'])
.not('attachment_url', 'is', null)
.order('created_at', { ascending: true })
.limit(limit)

if (error) {
return res.status(500).json({
success: false,
message: error.message
})
}

if (!items || !items.length) {
return res.status(200).json({
success: true,
message: 'Tidak ada attachment item pending',
processed: 0,
sent: 0,
failed: 0,
results: []
})
}

const results = []
let sent = 0
let failed = 0

for (const item of items) {
const job = getJobFromItem(item)
const caption = cleanText(item.attachment_caption) || cleanText(item.message)

try {
await supabaseAdmin
.from('send_job_items')
.update({
status: 'processing',
updated_at: new Date().toISOString()
})
.eq('id', item.id)

const result = await sendWhatsAppMedia({
to: item.phone,
message: item.message,
attachment_url: item.attachment_url,
attachment_type: item.attachment_type,
attachment_filename: item.attachment_filename,
attachment_caption: caption
})

await supabaseAdmin
.from('send_job_items')
.update({
status: 'sent',
meta_message_id: result.meta_message_id || null,
processed_at: new Date().toISOString(),
updated_at: new Date().toISOString(),
error_message: null,
attachment_caption: caption || null
})
.eq('id', item.id)

await insertLog({
item: {
...item,
attachment_caption: caption
},
job,
status: 'sent',
result,
errorMessage: null
})

sent += 1

results.push({
item_id: item.id,
phone: item.phone,
status: 'sent',
mode: 'media',
attachment_url: item.attachment_url,
attachment_caption: caption,
uploaded_media_id: result.uploaded_media_id || null,
meta_message_id: result.meta_message_id || null
})

if (item.job_id) {
await updateJobStatus(item.job_id)
}
} catch (sendError) {
const errorMessage = sendError.message || 'Kirim attachment gagal.'

await supabaseAdmin
.from('send_job_items')
.update({
status: 'failed',
error_message: errorMessage,
processed_at: new Date().toISOString(),
updated_at: new Date().toISOString(),
attachment_caption: caption || null
})
.eq('id', item.id)

await insertLog({
item: {
...item,
attachment_caption: caption
},
job,
status: 'failed',
result: null,
errorMessage
})

failed += 1

results.push({
item_id: item.id,
phone: item.phone,
status: 'failed',
mode: 'media',
attachment_url: item.attachment_url,
attachment_caption: caption,
error_message: errorMessage
})

if (item.job_id) {
await updateJobStatus(item.job_id)
}
}
}

return res.status(200).json({
success: true,
processed: results.length,
sent,
failed,
results
})
} catch (error) {
return res.status(500).json({
success: false,
message: error.message || 'Process attachment job gagal.'
})
}
}