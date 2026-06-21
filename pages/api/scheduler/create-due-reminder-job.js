import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { normalizeAttachment } from '../../../lib/whatsappSender'

function getSecret(req) {
  return (
    req.headers['x-job-runner-secret'] ||
    req.query.secret ||
    req.body?.secret ||
    ''
  )
}

function authorizeScheduler(req) {
  const secret = getSecret(req)

  if (!process.env.JOB_RUNNER_SECRET) {
    return true
  }

  return secret && secret === process.env.JOB_RUNNER_SECRET
}

function cleanPhone(phone) {
  return String(phone || '')
    .replace(/\D/g, '')
    .replace(/^0/, '62')
}

function toJakartaTodayRange() {
  const now = new Date()
  const jakartaNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))

  const y = jakartaNow.getFullYear()
  const m = String(jakartaNow.getMonth() + 1).padStart(2, '0')
  const d = String(jakartaNow.getDate()).padStart(2, '0')

  const start = new Date(`${y}-${m}-${d}T00:00:00+07:00`).toISOString()
  const end = new Date(`${y}-${m}-${d}T23:59:59+07:00`).toISOString()

  return {
    start,
    end,
    dateText: `${y}-${m}-${d}`
  }
}

function normalizeReminderContact(contact) {
  const phone = cleanPhone(contact.phone || contact.nomor || contact.whatsapp || contact.wa)
  const message = String(contact.message || contact.pesan || contact.body || '').trim()
  const name = String(contact.name || contact.nama || contact.profile_name || '').trim()

  const attachment = normalizeAttachment({
    message,
    attachment_url: contact.attachment_url,
    attachment_type: contact.attachment_type,
    attachment_filename: contact.attachment_filename,
    attachment_caption: contact.attachment_caption
  })

  return {
    name,
    phone,
    message,
    attachment_url: attachment.attachment_url || null,
    attachment_type: attachment.attachment_type || null,
    attachment_filename: attachment.attachment_filename || null,
    attachment_caption: attachment.attachment_caption || null
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')

  try {
    if (!['GET', 'POST'].includes(req.method)) {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    if (!authorizeScheduler(req)) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized scheduler'
      })
    }

    const { start, end, dateText } = toJakartaTodayRange()

    const { data: databases, error: dbError } = await supabaseAdmin
      .from('contact_databases')
      .select('*')
      .eq('type', 'reminder')
      .order('created_at', { ascending: false })
      .limit(1000)

    if (dbError) {
      return res.status(500).json({
        success: false,
        message: dbError.message
      })
    }

    let createdJobs = 0
    let createdItems = 0
    const results = []

    for (const database of databases || []) {
      const { data: contacts, error: contactsError } = await supabaseAdmin
        .from('contacts')
        .select('*')
        .eq('database_id', database.id)
        .gte('reminder_date', start)
        .lte('reminder_date', end)
        .limit(50000)

      if (contactsError) {
        results.push({
          database_id: database.id,
          database_name: database.name || database.database_name || database.title,
          success: false,
          message: contactsError.message
        })
        continue
      }

      const validContacts = (contacts || [])
        .map(normalizeReminderContact)
        .filter((item) => item.phone && item.message)

      if (validContacts.length === 0) {
        results.push({
          database_id: database.id,
          database_name: database.name || database.database_name || database.title,
          success: true,
          message: 'Tidak ada reminder due hari ini',
          total: 0
        })
        continue
      }

      const jobName =
        `Reminder ${database.name || database.database_name || database.title || database.id} ${dateText}`

      const { data: job, error: jobError } = await supabaseAdmin
        .from('send_jobs')
        .insert({
          type: 'reminder',
          status: 'pending',
          database_id: database.id,
          name: jobName,
          title: jobName,
          total_items: validContacts.length,
          batch_limit: Number(process.env.AUTO_REMINDER_BATCH_SIZE || process.env.JOB_BATCH_LIMIT || 10),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('*')
        .single()

      if (jobError) {
        results.push({
          database_id: database.id,
          database_name: database.name || database.database_name || database.title,
          success: false,
          message: jobError.message
        })
        continue
      }

      const now = new Date().toISOString()

      const jobItems = validContacts.map((contact) => ({
        job_id: job.id,
        phone: contact.phone,
        name: contact.name || null,
        message: contact.message,
        status: 'pending',
        attachment_url: contact.attachment_url || null,
        attachment_type: contact.attachment_type || null,
        attachment_filename: contact.attachment_filename || null,
        attachment_caption: contact.attachment_caption || null,
        created_at: now,
        updated_at: now
      }))

      const { error: insertError } = await supabaseAdmin
        .from('send_job_items')
        .insert(jobItems)

      if (insertError) {
        await supabaseAdmin
          .from('send_jobs')
          .update({
            status: 'failed',
            error_message: insertError.message,
            updated_at: new Date().toISOString()
          })
          .eq('id', job.id)

        results.push({
          database_id: database.id,
          job_id: job.id,
          success: false,
          message: insertError.message
        })
        continue
      }

      createdJobs += 1
      createdItems += jobItems.length

      results.push({
        database_id: database.id,
        job_id: job.id,
        success: true,
        total: jobItems.length,
        with_attachment: jobItems.filter((item) => item.attachment_url).length
      })
    }

    return res.status(200).json({
      success: true,
      date: dateText,
      createdJobs,
      createdItems,
      results
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create due reminder job'
    })
  }
}