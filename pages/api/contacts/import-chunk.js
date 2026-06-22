import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

const MAX_CHUNK_SIZE = 150

function cleanText(value) {
  return String(value || '').trim()
}

function cleanPhone(value) {
  let phone = String(value || '').trim()
  let result = ''

  if (phone.startsWith('="')) phone = phone.slice(2)
  if (phone.endsWith('"')) phone = phone.slice(0, -1)
  if (phone.startsWith("'")) phone = phone.slice(1)

  for (const char of phone) {
    if ('0123456789'.includes(char)) result += char
  }

  if (result.startsWith('0')) result = '62' + result.slice(1)

  return result
}

function normalizeDate(value) {
  const text = cleanText(value)

  if (!text) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text

  return text
}

function normalizeTime(value) {
  const text = cleanText(value)

  if (!text) return '09:00'

  const parts = text.split(':')
  const hour = String(parts[0] || '09').padStart(2, '0')
  const minute = String(parts[1] || '00').padStart(2, '0')

  return `${hour}:${minute}`
}

function buildReminderAt(reminderDate, reminderTime) {
  const dateText = normalizeDate(reminderDate)
  const timeText = normalizeTime(reminderTime)

  if (!dateText) return null

  const date = new Date(`${dateText}T${timeText}:00+07:00`)

  if (Number.isNaN(date.getTime())) return null

  return date.toISOString()
}

function getRows(body) {
  if (Array.isArray(body.rows)) return body.rows
  if (Array.isArray(body.contacts)) return body.contacts
  if (Array.isArray(body.items)) return body.items
  return []
}

function normalizeRow(row, databaseId, type) {
  const name = cleanText(row.name || row.nama || row.customer_name || row.patient_name)
  const phone = cleanPhone(row.phone || row.no_hp || row.nomor || row.whatsapp || row.wa)
  const message = cleanText(row.message || row.pesan || row.template || row.text)

  const reminderDate = normalizeDate(
    row.reminder_date ||
    row.tanggal ||
    row.date ||
    row.jadwal_tanggal
  )

  const reminderTime = normalizeTime(
    row.reminder_time ||
    row.jam ||
    row.time ||
    row.jadwal_jam
  )

  const reminderAt = buildReminderAt(reminderDate, reminderTime)

  return {
    database_id: databaseId,
    type,
    name,
    phone,
    message,
    reminder_date: reminderDate,
    reminder_time: reminderTime,
    reminder_at: reminderAt,
    attachment_url: cleanText(row.attachment_url || row.file_url || row.url) || null,
    attachment_type: cleanText(row.attachment_type) || null,
    attachment_filename: cleanText(row.attachment_filename) || null,
    attachment_caption: cleanText(row.attachment_caption) || null,
    updated_at: new Date().toISOString()
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    const authUser = await requireRole(req, res, ['master', 'admin', 'user', 'agent'])
    if (!authUser) return

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const body = req.body || {}
    const databaseId = cleanText(body.database_id || body.databaseId)
    const type = cleanText(body.type || 'blast').toLowerCase()
    const rows = getRows(body)

    if (!databaseId) {
      return res.status(400).json({
        success: false,
        message: 'database_id wajib diisi.'
      })
    }

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: 'Tidak ada data kontak untuk diimport.'
      })
    }

    if (rows.length > MAX_CHUNK_SIZE) {
      return res.status(400).json({
        success: false,
        message: `Maksimal ${MAX_CHUNK_SIZE} kontak per chunk.`
      })
    }

    const insertRows = []
    const skipped = []

    rows.forEach((row, index) => {
      const normalized = normalizeRow(row, databaseId, type)

      if (!normalized.name || !normalized.phone || !normalized.message) {
        skipped.push({
          index,
          name: normalized.name,
          phone: normalized.phone,
          reason: 'name/phone/message kosong'
        })
        return
      }

      if (type === 'reminder' && !normalized.reminder_date) {
        skipped.push({
          index,
          name: normalized.name,
          phone: normalized.phone,
          reason: 'reminder_date kosong'
        })
        return
      }

      insertRows.push(normalized)
    })

    if (!insertRows.length) {
      return res.status(400).json({
        success: false,
        message: 'Tidak ada kontak valid untuk diimport.',
        skipped
      })
    }

    const result = await supabaseAdmin
      .from('contacts')
      .insert(insertRows)
      .select('id, database_id, type, name, phone, message, reminder_date, reminder_time, reminder_at')

    if (result.error) {
      return res.status(500).json({
        success: false,
        message: result.error.message
      })
    }

    return res.status(200).json({
      success: true,
      inserted: result.data?.length || 0,
      skipped,
      rows: result.data || []
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal import contacts chunk.'
    })
  }
}