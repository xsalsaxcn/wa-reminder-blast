import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'
import { sendWhatsAppMessage, normalizeAttachment } from '../../../lib/whatsappSender'

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

async function getContactAttachmentFallback(item, job) {
  if (item.attachment_url) {
    return item
  }

  if (!job?.database_id || !item.phone) {
    return item
  }

  const { data } = await supabaseAdmin
    .from('contacts')
    .select('attachment_url, attachment_type, attachment_filename, attachment_caption')
    .eq('database_id', job.database_id)
    .eq('phone', item.phone)
    .maybeSingle()

  if (!data?.attachment_url) {
    return item
  }

  return {
    ...item,
    attachment_url: data.attachment_url,
    attachment_type: data.attachment_type,
    attachment_filename: data.attachment_filename,
    attachment_caption: data.attachment_caption
  }
}

async function writeLog({ job, item, status, errorMessage, metaMessageId }) {
  const attachment = normalizeAttachment(item)

  const payload = {
    phone: item.phone,
    name: item.name || null,
    message: item.message || '',
    status,
    error_message: errorMessage || null,
    job_id: job.id,
    attachment_url: attachment.attachment_url || null,
    attachment_type: attachment.attachment_type || null,
    attachment_filename: attachment.attachment_filename || null,
    attachment_caption: attachment.attachment_caption || null,
    meta_message_id: metaMessageId || null,
    created_at: new Date().toISOString()
  }

  const type = String(job.type || '').toLowerCase()

  if (type === 'reminder') {
    await supabaseAdmin.from('reminder_logs').insert(payload)
  } else {
    await supabaseAdmin.from('blast_logs').insert(payload)
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')

  try {
    await authorize(req, res)

    if (!['POST', 'GET'].includes(req.method)) {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const batchLimit = Number(
      req.query.limit ||
      req.body?.limit ||
      process.env.JOB_BATCH_LIMIT ||
      10
    )

    const { data: job, error: jobError } = await supabaseAdmin
      .from('send_jobs')
      .select('*')
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (jobError) {
      return res.status(500).json({
        success: false,
        message: jobError.message
      })
    }

    if (!job) {
      return res.status(200).json({
        success: true,
        message: 'Tidak ada job pending',
        processed: 0
      })
    }

    await supabaseAdmin
      .from('send_jobs')
      .update({
        status: 'processing',
        updated_at: new Date().toISOString()
      })
      .eq('id', job.id)

    const { data: items, error: itemsError } = await supabaseAdmin
      .from('send_job_items')
      .select('*')
      .eq('job_id', job.id)
      .in('status', ['pending', 'queued'])
      .order('created_at', { ascending: true })
      .limit(batchLimit)

    if (itemsError) {
      return res.status(500).json({
        success: false,
        message: itemsError.message
      })
    }

    if (!items || items.length === 0) {
      await supabaseAdmin
        .from('send_jobs')
        .update({
          status: 'done',
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id)

      return res.status(200).json({
        success: true,
        message: 'Job selesai',
        job_id: job.id,
        processed: 0
      })
    }

    let sent = 0
    let failed = 0
    const results = []

    for (const rawItem of items) {
      const item = await getContactAttachmentFallback(rawItem, job)
      const attachment = normalizeAttachment(item)

      await supabaseAdmin
        .from('send_job_items')
        .update({
          status: 'processing',
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id)

      try {
        const sendResult = await sendWhatsAppMessage({
          phone: item.phone,
          message: item.message,
          attachment_url: attachment.attachment_url,
          attachment_type: attachment.attachment_type,
          attachment_filename: attachment.attachment_filename,
          attachment_caption: attachment.attachment_caption
        })

        const metaMessageId = sendResult?.messages?.[0]?.id || null

        await supabaseAdmin
          .from('send_job_items')
          .update({
            status: 'sent',
            processed_at: new Date().toISOString(),
            meta_message_id: metaMessageId,
            attachment_url: attachment.attachment_url || null,
            attachment_type: attachment.attachment_type || null,
            attachment_filename: attachment.attachment_filename || null,
            attachment_caption: attachment.attachment_caption || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id)

        await writeLog({
          job,
          item: {
            ...item,
            attachment_url: attachment.attachment_url,
            attachment_type: attachment.attachment_type,
            attachment_filename: attachment.attachment_filename,
            attachment_caption: attachment.attachment_caption
          },
          status: 'sent',
          errorMessage: null,
          metaMessageId
        })

        sent += 1
        results.push({
          item_id: item.id,
          phone: item.phone,
          status: 'sent',
          attachment: Boolean(attachment.attachment_url),
          meta_message_id: metaMessageId
        })
      } catch (err) {
        await supabaseAdmin
          .from('send_job_items')
          .update({
            status: 'failed',
            error_message: err.message,
            processed_at: new Date().toISOString(),
            attachment_url: attachment.attachment_url || null,
            attachment_type: attachment.attachment_type || null,
            attachment_filename: attachment.attachment_filename || null,
            attachment_caption: attachment.attachment_caption || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id)

        await writeLog({
          job,
          item: {
            ...item,
            attachment_url: attachment.attachment_url,
            attachment_type: attachment.attachment_type,
            attachment_filename: attachment.attachment_filename,
            attachment_caption: attachment.attachment_caption
          },
          status: 'failed',
          errorMessage: err.message,
          metaMessageId: null
        })

        failed += 1
        results.push({
          item_id: item.id,
          phone: item.phone,
          status: 'failed',
          attachment: Boolean(attachment.attachment_url),
          error: err.message
        })
      }
    }

    const { count: remaining } = await supabaseAdmin
      .from('send_job_items')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', job.id)
      .in('status', ['pending', 'queued', 'processing'])

    if (!remaining || remaining <= 0) {
      await supabaseAdmin
        .from('send_jobs')
        .update({
          status: 'done',
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id)
    }

    return res.status(200).json({
      success: true,
      job_id: job.id,
      processed: items.length,
      sent,
      failed,
      remaining: remaining || 0,
      results
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to process job'
    })
  }
}