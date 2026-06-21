

import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'
import { sendWhatsAppMedia, normalizeAttachment } from '../../../lib/whatsappSender'

function getSecret(req) {
return (
req.headers['x-job-runner-secret'] ||
req.query.secret ||
req.body?.secret ||
''
)
}

async function authorize(req, res) {
const secret = getSecret(req)

if (
process.env.JOB_RUNNER_SECRET &&
secret &&
secret === process.env.JOB_RUNNER_SECRET
) {
return {
username: 'job-runner',
role: 'system'
}
}

return requireRole(req, res, ['master', 'admin', 'user', 'agent'])
}

async function writeLog({ job, item, status, errorMessage, metaMessageId }) {
const payload = {
phone: item.phone,
name: item.name || null,
message: item.message || '',
status,
error_message: errorMessage || null,
job_id: job.id,
attachment_url: item.attachment_url || null,
attachment_type: item.attachment_type || null,
attachment_filename: item.attachment_filename || null,
attachment_caption: item.attachment_caption || null,
meta_message_id: metaMessageId || null,
created_at: new Date().toISOString()
}

if (String(job.type || '').toLowerCase() === 'reminder') {
await supabaseAdmin.from('reminder_logs').insert(payload)
} else {
await supabaseAdmin.from('blast_logs').insert(payload)
}
}

async function updateJobStatus(jobId) {
if (!jobId) return

const { count: remaining } = await supabaseAdmin
.from('send_job_items')
.select('id', { count: 'exact', head: true })
.eq('job_id', jobId)
.in('status', ['pending', 'queued', 'processing'])

if (!remaining || remaining <= 0) {
await supabaseAdmin
.from('send_jobs')
.update({
status: 'done',
finished_at: new Date().toISOString(),
updated_at: new Date().toISOString()
})
.eq('id', jobId)
} else {
await supabaseAdmin
.from('send_jobs')
.update({
status: 'pending',
updated_at: new Date().toISOString()
})
.eq('id', jobId)
}
}

export default async function handler(req, res) {
res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
res.setHeader('Pragma', 'no-cache')
res.setHeader('Expires', '0')

try {
await authorize(req, res)

if (!['GET', 'POST'].includes(req.method)) {
return res.status(405).json({
success: false,
message: 'Method not allowed'
})
}

const batchLimit = Number(req.query.limit || req.body?.limit || 1)

const { data: items, error: itemError } = await supabaseAdmin
.from('send_job_items')
.select(', send_jobs:job_id ()')
.not('attachment_url', 'is', null)
.in('status', ['pending', 'queued'])
.order('created_at', { ascending: true })
.limit(batchLimit)

if (itemError) {
return res.status(500).json({
success: false,
message: itemError.message
})
}

if (!items || items.length === 0) {
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

for (const rawItem of items) {
const job = rawItem.send_jobs || {}
const attachment = normalizeAttachment(rawItem)

await supabaseAdmin
.from('send_job_items')
.update({
status: 'processing',
error_message: 'PROCESSING_MEDIA_ATTACHMENT',
updated_at: new Date().toISOString()
})
.eq('id', rawItem.id)

try {
if (!attachment.hasAttachment) {
throw new Error('Item ini tidak punya attachment_url')
}

const itemForSend = {
...rawItem,
attachment_url: attachment.attachment_url,
attachment_type: attachment.attachment_type,
attachment_filename: attachment.attachment_filename,
attachment_caption: attachment.attachment_caption
}

const result = await sendWhatsAppMedia({
phone: rawItem.phone,
message: rawItem.message,
attachment_url: attachment.attachment_url,
attachment_type: attachment.attachment_type,
attachment_filename: attachment.attachment_filename,
attachment_caption: attachment.attachment_caption
})

const metaMessageId = result?.messages?.[0]?.id || null
const uploadedMediaId = result?.uploaded_media_id || null

await supabaseAdmin
.from('send_job_items')
.update({
status: 'sent',
error_message: null,
processed_at: new Date().toISOString(),
meta_message_id: metaMessageId,
attachment_url: attachment.attachment_url,
attachment_type: attachment.attachment_type,
attachment_filename: attachment.attachment_filename,
attachment_caption: attachment.attachment_caption,
updated_at: new Date().toISOString()
})
.eq('id', rawItem.id)

await writeLog({
job,
item: itemForSend,
status: 'sent',
errorMessage: null,
metaMessageId
})

sent += 1

results.push({
item_id: rawItem.id,
job_id: rawItem.job_id,
phone: rawItem.phone,
status: 'sent',
mode: 'media',
attachment_url: attachment.attachment_url,
attachment_type: attachment.attachment_type,
attachment_filename: attachment.attachment_filename,
uploaded_media_id: uploadedMediaId,
meta_message_id: metaMessageId
})
} catch (err) {
await supabaseAdmin
.from('send_job_items')
.update({
status: 'failed',
error_message: err.message,
processed_at: new Date().toISOString(),
updated_at: new Date().toISOString()
})
.eq('id', rawItem.id)

await writeLog({
job,
item: rawItem,
status: 'failed',
errorMessage: err.message,
metaMessageId: null
})

failed += 1

results.push({
item_id: rawItem.id,
job_id: rawItem.job_id,
phone: rawItem.phone,
status: 'failed',
mode: 'media',
attachment_url: attachment.attachment_url || rawItem.attachment_url,
attachment_type: attachment.attachment_type || rawItem.attachment_type,
attachment_filename: attachment.attachment_filename || rawItem.attachment_filename,
error: err.message
})
}
}

const affectedJobIds = [...new Set(items.map((item) => item.job_id).filter(Boolean))]

for (const jobId of affectedJobIds) {
await updateJobStatus(jobId)
}

return res.status(200).json({
success: true,
processed: items.length,
sent,
failed,
results
})
} catch (error) {
return res.status(500).json({
success: false,
message: error.message || 'Failed to process attachment item'
})
}
}