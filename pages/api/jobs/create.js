import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'
import { normalizeAttachment } from '../../../lib/whatsappSender'

function cleanText(value) {
  return String(value || '').trim()
}

function cleanPhone(phone) {
  return String(phone || '')
    .replace(/\D/g, '')
    .replace(/^0/, '62')
}

function getJobType(value) {
  const type = String(value || '').trim().toLowerCase()

  if (type === 'reminder') return 'reminder'
  if (type === 'blast') return 'blast'

  return 'blast'
}

function getContactName(contact) {
  return cleanText(
    contact.name ||
    contact.nama ||
    contact.profile_name ||
    contact.customer_name ||
    ''
  )
}

function getContactMessage(contact, fallbackMessage) {
  const message = cleanText(
    contact.message ||
    contact.pesan ||
    contact.body ||
    contact.text ||
    ''
  )

  if (message) return message

  return cleanText(fallbackMessage)
}

function normalizeContactForJob(contact, fallbackMessage) {
  const phone = cleanPhone(
    contact.phone ||
    contact.nomor ||
    contact.no_hp ||
    contact.whatsapp ||
    contact.wa ||
    ''
  )

  const message = getContactMessage(contact, fallbackMessage)

  const attachment = normalizeAttachment({
    message,
    attachment_url: contact.attachment_url,
    attachment_type: contact.attachment_type,
    attachment_filename: contact.attachment_filename,
    attachment_caption: contact.attachment_caption
  })

  return {
    name: getContactName(contact),
    phone,
    message,
    attachment_url: attachment.attachment_url || null,
    attachment_type: attachment.attachment_type || null,
    attachment_filename: attachment.attachment_filename || null,
    attachment_caption: attachment.attachment_caption || null
  }
}

async function insertJob(payload) {
  const attempts = [
    payload,
    {
      type: payload.type,
      status: payload.status,
      database_id: payload.database_id,
      total_items: payload.total_items,
      created_at: payload.created_at,
      updated_at: payload.updated_at
    },
    {
      type: payload.type,
      status: payload.status,
      database_id: payload.database_id,
      created_at: payload.created_at,
      updated_at: payload.updated_at
    },
    {
      type: payload.type,
      status: payload.status,
      database_id: payload.database_id,
      created_at: payload.created_at
    }
  ]

  let lastError = null

  for (const item of attempts) {
    const { data, error } = await supabaseAdmin
      .from('send_jobs')
      .insert(item)
      .select('*')
      .single()

    if (!error && data) return data

    lastError = error
  }

  throw lastError || new Error('Gagal membuat send job')
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    await requireRole(req, res, ['master', 'admin', 'user', 'agent'])

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const {
      type,
      job_type,
      database_id,
      databaseId,
      contact_database_id,
      message,
      default_message,
      name,
      title,
      batch_limit
    } = req.body || {}

    const selectedDatabaseId = database_id || databaseId || contact_database_id

    if (!selectedDatabaseId) {
      return res.status(400).json({
        success: false,
        message: 'Database wajib dipilih'
      })
    }

    const jobType = getJobType(type || job_type)
    const fallbackMessage = cleanText(message || default_message)

    const { data: database, error: databaseError } = await supabaseAdmin
      .from('contact_databases')
      .select('*')
      .eq('id', selectedDatabaseId)
      .maybeSingle()

    if (databaseError) {
      return res.status(500).json({
        success: false,
        message: databaseError.message
      })
    }

    if (!database) {
      return res.status(404).json({
        success: false,
        message: 'Database tidak ditemukan'
      })
    }

    const { data: contacts, error: contactsError } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('database_id', selectedDatabaseId)
      .limit(50000)

    if (contactsError) {
      return res.status(500).json({
        success: false,
        message: contactsError.message
      })
    }

    const validContacts = (contacts || [])
      .map((contact) => normalizeContactForJob(contact, fallbackMessage))
      .filter((contact) => contact.phone && contact.message)

    if (validContacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tidak ada kontak valid untuk dibuat job'
      })
    }

    const jobName =
      cleanText(name || title) ||
      cleanText(database.name || database.database_name || database.title) ||
      `${jobType} ${new Date().toLocaleString('id-ID')}`

    const now = new Date().toISOString()

    const job = await insertJob({
      type: jobType,
      status: 'pending',
      database_id: selectedDatabaseId,
      name: jobName,
      title: jobName,
      total_items: validContacts.length,
      batch_limit: Number(batch_limit || process.env.JOB_BATCH_LIMIT || 10),
      created_at: now,
      updated_at: now
    })

    const jobItems = validContacts.map((contact) => ({
      job_id: job.id,
      name: contact.name || null,
      phone: contact.phone,
      message: contact.message,
      status: 'pending',
      attachment_url: contact.attachment_url || null,
      attachment_type: contact.attachment_type || null,
      attachment_filename: contact.attachment_filename || null,
      attachment_caption: contact.attachment_caption || null,
      created_at: now,
      updated_at: now
    }))

    const { error: itemsError } = await supabaseAdmin
      .from('send_job_items')
      .insert(jobItems)

    if (itemsError) {
      await supabaseAdmin
        .from('send_jobs')
        .update({
          status: 'failed',
          error_message: itemsError.message,
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id)

      return res.status(500).json({
        success: false,
        message: itemsError.message
      })
    }

    return res.status(200).json({
      success: true,
      job,
      total_items: jobItems.length,
      with_attachment: jobItems.filter((item) => item.attachment_url).length,
      message: `Job berhasil dibuat. Total: ${jobItems.length}. Attachment: ${jobItems.filter((item) => item.attachment_url).length}.`
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create job'
    })
  }
}