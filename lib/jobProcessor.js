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
