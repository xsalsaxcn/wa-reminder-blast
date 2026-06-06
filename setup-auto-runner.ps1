New-Item -ItemType Directory -Force -Path "lib" | Out-Null
New-Item -ItemType Directory -Force -Path "pages\api\jobs" | Out-Null
New-Item -ItemType Directory -Force -Path "huggingface-runner" | Out-Null

@'
import { supabaseAdmin } from './supabaseAdmin'
import { sendWhatsAppText, sendWhatsAppTemplate } from './metaWhatsapp'
import { sleep, getSendDelayMs } from './rateLimit'

function getValue(contact, field) {
  const value = contact?.[field]
  if (value === null || value === undefined) return ''
  return String(value)
}

function interpolateMessage(template, contact) {
  if (!template) return ''

  return template
    .replaceAll('{name}', getValue(contact, 'name'))
    .replaceAll('{phone}', getValue(contact, 'phone'))
    .replaceAll('{message}', getValue(contact, 'message'))
    .replaceAll('{reminder_date}', getValue(contact, 'reminder_date'))
    .replaceAll('{reminder_time}', getValue(contact, 'reminder_time'))
}

async function getSetting(type) {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_settings')
    .select('*')
    .eq('type', type)
    .maybeSingle()

  if (error) throw error

  if (type === 'reminder') {
    return data || {
      message_mode: 'text',
      template_variables: [],
      default_message: 'Halo {name}, ini reminder untuk jadwal Anda pada {reminder_date} pukul {reminder_time}.'
    }
  }

  return data || {
    message_mode: 'text',
    template_variables: [],
    default_message: 'Halo {name}, ini informasi terbaru dari layanan kami.'
  }
}

async function updateJobCounter(jobId) {
  const { data: items, error } = await supabaseAdmin
    .from('send_job_items')
    .select('status')
    .eq('job_id', jobId)

  if (error) throw error

  const total = items.length
  const sent = items.filter((item) => item.status === 'sent').length
  const failed = items.filter((item) => item.status === 'failed').length
  const pending = items.filter((item) => item.status === 'pending').length
  const status = pending === 0 ? 'done' : 'pending'

  await supabaseAdmin
    .from('send_jobs')
    .update({
      total,
      sent,
      failed,
      status,
      updated_at: new Date().toISOString()
    })
    .eq('id', jobId)

  return { total, sent, failed, pending, status }
}

async function getNextJob(type = null) {
  let query = supabaseAdmin
    .from('send_jobs')
    .select('*')
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: true })
    .limit(1)

  if (type) {
    query = query.eq('type', type)
  }

  const { data, error } = await query

  if (error) throw error

  return data?.[0] || null
}

async function processJobBatch({ jobId, limit = 10 }) {
  const batchLimit = Math.min(Math.max(Number(limit || 10), 1), 50)
  const delayMs = getSendDelayMs()

  const { data: job, error: jobError } = await supabaseAdmin
    .from('send_jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (jobError) throw jobError

  if (!job) {
    return {
      success: false,
      message: 'Job tidak ditemukan',
      processed: 0
    }
  }

  if (job.status === 'done') {
    return {
      success: true,
      message: 'Job sudah selesai',
      processed: 0,
      job
    }
  }

  await supabaseAdmin
    .from('send_jobs')
    .update({
      status: 'processing',
      updated_at: new Date().toISOString()
    })
    .eq('id', jobId)

  const { data: items, error: itemsError } = await supabaseAdmin
    .from('send_job_items')
    .select(`
      *,
      contacts (*)
    `)
    .eq('job_id', jobId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(batchLimit)

  if (itemsError) throw itemsError

  if (!items || items.length === 0) {
    const counters = await updateJobCounter(jobId)

    return {
      success: true,
      message: 'Tidak ada item pending',
      processed: 0,
      counters,
      job
    }
  }

  const setting = await getSetting(job.type)

  let processed = 0
  let sent = 0
  let failed = 0

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const contact = item.contacts || {}

    let result
    let message = item.message || contact.message || interpolateMessage(setting.default_message, contact)

    if (setting.message_mode === 'template') {
      const variables = Array.isArray(setting.template_variables)
        ? setting.template_variables.map((field) => getValue(contact, field))
        : []

      result = await sendWhatsAppTemplate({
        phone: item.phone,
        templateName: setting.template_name,
        languageCode: setting.language_code || 'id',
        variables
      })

      message = `TEMPLATE: ${setting.template_name} | VARS: ${variables.join(', ')}`
    } else {
      result = await sendWhatsAppText({
        phone: item.phone,
        message
      })
    }

    const status = result.ok ? 'sent' : 'failed'

    if (result.ok) sent += 1
    else failed += 1

    await supabaseAdmin
      .from('send_job_items')
      .update({
        status,
        meta_message_id: result.messageId || null,
        error_message: result.error || null,
        processed_at: new Date().toISOString()
      })
      .eq('id', item.id)

    const logTable = job.type === 'reminder' ? 'reminder_logs' : 'blast_logs'

    await supabaseAdmin.from(logTable).insert({
      database_id: job.database_id,
      contact_id: item.contact_id,
      phone: item.phone,
      message,
      status,
      meta_message_id: result.messageId || null,
      error_message: result.error || null
    })

    processed += 1

    if (i < items.length - 1) {
      await sleep(delayMs)
    }
  }

  const counters = await updateJobCounter(jobId)

  return {
    success: true,
    message: `Batch selesai. Diproses: ${processed}, Terkirim: ${sent}, Gagal: ${failed}, Pending: ${counters.pending}`,
    processed,
    sent,
    failed,
    delayMs,
    counters,
    job
  }
}

async function processNextJob({ type = null, limit = 10 } = {}) {
  const job = await getNextJob(type)

  if (!job) {
    return {
      success: true,
      message: 'Tidak ada job pending',
      processed: 0,
      job: null
    }
  }

  return processJobBatch({
    jobId: job.id,
    limit
  })
}

export {
  processJobBatch,
  processNextJob
}
'@ | Set-Content -Encoding UTF8 "lib\jobProcessor.js"

@'
import { requireRole } from '../../../lib/auth'
import { processJobBatch } from '../../../lib/jobProcessor'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin', 'user'])
  if (!authUser) return

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const { jobId, limit } = req.body

    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: 'jobId wajib diisi'
      })
    }

    const result = await processJobBatch({
      jobId,
      limit: limit || process.env.JOB_BATCH_LIMIT || 10
    })

    return res.status(200).json(result)
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memproses job'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\jobs\process.js"

@'
import { processNextJob } from '../../../lib/jobProcessor'

function isAuthorized(req) {
  const expected = process.env.JOB_RUNNER_SECRET
  const headerSecret = req.headers['x-job-runner-secret']
  const querySecret = req.query.secret

  if (!expected) return false

  return headerSecret === expected || querySecret === expected
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized runner'
    })
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const type = req.query.type || req.body?.type || null
    const limit = req.query.limit || req.body?.limit || process.env.JOB_BATCH_LIMIT || 10

    const result = await processNextJob({
      type,
      limit
    })

    return res.status(200).json({
      ...result,
      runner: true
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Auto runner failed',
      runner: true
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\jobs\process-next.js"

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin'])
  if (!authUser) return

  try {
    const { data: jobs, error } = await supabaseAdmin
      .from('send_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw error

    const summary = {
      total: jobs?.length || 0,
      pending: jobs?.filter((job) => job.status === 'pending').length || 0,
      processing: jobs?.filter((job) => job.status === 'processing').length || 0,
      done: jobs?.filter((job) => job.status === 'done').length || 0,
      failed: jobs?.filter((job) => job.status === 'failed').length || 0
    }

    return res.status(200).json({
      success: true,
      summary,
      jobs: jobs || []
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to load runner status'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\jobs\runner-status.js"

@'
{
  "name": "wa-reminder-blast-runner",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {}
}
'@ | Set-Content -Encoding UTF8 "huggingface-runner\package.json"

@'
const APP_URL = process.env.APP_URL
const JOB_RUNNER_SECRET = process.env.JOB_RUNNER_SECRET
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 15000)
const JOB_TYPE = process.env.JOB_TYPE || ''
const JOB_BATCH_LIMIT = process.env.JOB_BATCH_LIMIT || '10'

if (!APP_URL) {
  console.error('APP_URL is required')
  process.exit(1)
}

if (!JOB_RUNNER_SECRET) {
  console.error('JOB_RUNNER_SECRET is required')
  process.exit(1)
}

let running = false

async function tick() {
  if (running) {
    console.log('Previous tick still running, skip.')
    return
  }

  running = true

  try {
    const url = new URL('/api/jobs/process-next', APP_URL)

    if (JOB_TYPE) url.searchParams.set('type', JOB_TYPE)
    url.searchParams.set('limit', JOB_BATCH_LIMIT)

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'x-job-runner-secret': JOB_RUNNER_SECRET,
        'Content-Type': 'application/json'
      }
    })

    const data = await response.json()

    console.log(new Date().toISOString(), JSON.stringify(data))
  } catch (error) {
    console.error(new Date().toISOString(), error.message)
  } finally {
    running = false
  }
}

console.log('WA Reminder Blast Runner started')
console.log('APP_URL:', APP_URL)
console.log('INTERVAL_MS:', INTERVAL_MS)
console.log('JOB_TYPE:', JOB_TYPE || 'all')
console.log('JOB_BATCH_LIMIT:', JOB_BATCH_LIMIT)

tick()
setInterval(tick, INTERVAL_MS)
'@ | Set-Content -Encoding UTF8 "huggingface-runner\index.js"

@'
# WA Reminder Blast Runner

This is a small Node.js runner for Hugging Face Spaces.

## Environment Variables

APP_URL=https://your-vercel-app.vercel.app
JOB_RUNNER_SECRET=same_secret_as_next_app
INTERVAL_MS=15000
JOB_BATCH_LIMIT=10
JOB_TYPE=

JOB_TYPE can be empty, reminder, or blast.
'@ | Set-Content -Encoding UTF8 "huggingface-runner\README.md"

Write-Host "Auto runner setup selesai."