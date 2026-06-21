import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'
import { normalizeImportRow } from '../../../lib/importRowNormalizer'

function cleanText(value) {
  return String(value || '').trim()
}

function getDatabaseType(type) {
  const value = String(type || '').trim().toLowerCase()

  if (value === 'reminder') return 'reminder'
  if (value === 'blast') return 'blast'

  return 'blast'
}

function buildMessage(row) {
  const message = cleanText(row.message)
  const attachmentCaption = cleanText(row.attachment_caption)
  const attachmentFilename = cleanText(row.attachment_filename)
  const attachmentUrl = cleanText(row.attachment_url)

  if (message) return message
  if (attachmentCaption) return attachmentCaption
  if (attachmentFilename) return `[Attachment] ${attachmentFilename}`
  if (attachmentUrl) return `[Attachment] ${attachmentUrl}`

  return ''
}

function cleanAttachmentType(type, url) {
  const value = String(type || '').trim().toLowerCase()
  const lowerUrl = String(url || '').toLowerCase()

  if (value === 'image') return 'image'
  if (value === 'document') return 'document'

  if (
    lowerUrl.endsWith('.jpg') ||
    lowerUrl.endsWith('.jpeg') ||
    lowerUrl.endsWith('.png') ||
    lowerUrl.endsWith('.webp')
  ) {
    return 'image'
  }

  if (lowerUrl) return 'document'

  return ''
}

function guessFilenameFromUrl(url) {
  try {
    const parsed = new URL(url)
    const last = parsed.pathname.split('/').filter(Boolean).pop()

    if (last) {
      return decodeURIComponent(last)
    }
  } catch (err) {
    // ignore
  }

  return ''
}

function normalizeContact(row, type) {
  const normalized = normalizeImportRow(row)

  const message = buildMessage(normalized)
  const attachmentUrl = cleanText(normalized.attachment_url)
  const attachmentType = cleanAttachmentType(normalized.attachment_type, attachmentUrl)
  const attachmentFilename =
    cleanText(normalized.attachment_filename) ||
    guessFilenameFromUrl(attachmentUrl)

  return {
    name: cleanText(normalized.name),
    phone: cleanText(normalized.phone),
    message,
    reminder_date: type === 'reminder' ? cleanText(normalized.reminder_date) : null,
    attachment_url: attachmentUrl || null,
    attachment_type: attachmentType || null,
    attachment_filename: attachmentFilename || null,
    attachment_caption: cleanText(normalized.attachment_caption) || null
  }
}

async function createContactDatabase({ databaseName, type, totalContacts }) {
  const now = new Date().toISOString()

  const payloads = [
    {
      name: databaseName,
      type,
      total_contacts: totalContacts,
      created_at: now,
      updated_at: now
    },
    {
      name: databaseName,
      type,
      total_contacts: totalContacts,
      created_at: now
    },
    {
      database_name: databaseName,
      type,
      total_contacts: totalContacts,
      created_at: now,
      updated_at: now
    },
    {
      database_name: databaseName,
      type,
      total_contacts: totalContacts,
      created_at: now
    }
  ]

  let lastError = null

  for (const payload of payloads) {
    const { data, error } = await supabaseAdmin
      .from('contact_databases')
      .insert(payload)
      .select('*')
      .single()

    if (!error && data) {
      return data
    }

    lastError = error
  }

  throw lastError || new Error('Gagal membuat database kontak')
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

    const { databaseName, name, type, contacts } = req.body || {}

    const cleanDatabaseName =
      cleanText(databaseName || name) ||
      `Import ${new Date().toLocaleString('id-ID')}`

    const databaseType = getDatabaseType(type)

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'contacts kosong'
      })
    }

    const maxImportContacts = Number(process.env.MAX_IMPORT_CONTACTS || 5000)

    if (contacts.length > maxImportContacts) {
      return res.status(400).json({
        success: false,
        message: `Import ditolak. Maksimal ${maxImportContacts} kontak per upload. File ini berisi ${contacts.length} baris. Pecah file menjadi beberapa batch.`
      })
    }

    const validContacts = contacts
      .map((contact) => normalizeContact(contact, databaseType))
      .filter((contact) => {
        if (!contact.phone) return false
        if (!contact.message) return false

        if (databaseType === 'reminder' && !contact.reminder_date) {
          return false
        }

        return true
      })

    if (validContacts.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          databaseType === 'reminder'
            ? 'Tidak ada kontak valid. Pastikan kolom name, phone, message, reminder_date terisi.'
            : 'Tidak ada kontak valid. Pastikan kolom name, phone, message terisi.'
      })
    }

    const database = await createContactDatabase({
      databaseName: cleanDatabaseName,
      type: databaseType,
      totalContacts: validContacts.length
    })

    const now = new Date().toISOString()

    const contactsToInsert = validContacts.map((contact) => ({
      database_id: database.id,
      name: contact.name || null,
      phone: contact.phone,
      message: contact.message,
      reminder_date: contact.reminder_date || null,
      attachment_url: contact.attachment_url || null,
      attachment_type: contact.attachment_type || null,
      attachment_filename: contact.attachment_filename || null,
      attachment_caption: contact.attachment_caption || null,
      created_at: now,
      updated_at: now
    }))

    const { error: contactsError } = await supabaseAdmin
      .from('contacts')
      .insert(contactsToInsert)

    if (contactsError) {
      await supabaseAdmin
        .from('contact_databases')
        .delete()
        .eq('id', database.id)

      return res.status(500).json({
        success: false,
        message: contactsError.message
      })
    }

    return res.status(200).json({
      success: true,
      database,
      total: contacts.length,
      imported: contactsToInsert.length,
      skipped: contacts.length - contactsToInsert.length,
      with_attachment: contactsToInsert.filter((item) => item.attachment_url).length,
      message: `Import berhasil: ${contactsToInsert.length} kontak`
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Import failed'
    })
  }
}