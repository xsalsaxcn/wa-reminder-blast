import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

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

function normalizeScheduleType(value) {
  const text = cleanText(value).toUpperCase()

  if (text === 'H-3') return 'H-3'
  if (text === 'H-1') return 'H-1'
  if (text === 'H-7JAM' || text === 'H-7 JAM' || text === 'H-7H') return 'H-7JAM'

  return ''
}

function getScheduleConfig(value) {
  const type = normalizeScheduleType(value)

  if (type === 'H-3') {
    return {
      schedule_type: 'H-3',
      schedule_label: 'Reminder H-3',
      offset_minutes: 3 * 24 * 60
    }
  }

  if (type === 'H-1') {
    return {
      schedule_type: 'H-1',
      schedule_label: 'Reminder H-1',
      offset_minutes: 24 * 60
    }
  }

  if (type === 'H-7JAM') {
    return {
      schedule_type: 'H-7JAM',
      schedule_label: 'Reminder H-7 Jam',
      offset_minutes: 7 * 60
    }
  }

  return null
}

function normalizeDate(value) {
  const text = cleanText(value)
  if (!text) return ''
  return text.slice(0, 10)
}

function normalizeTime(value) {
  const text = cleanText(value)

  if (!text) return '09:00'

  const parts = text.split(':')
  const hour = String(parts[0] || '09').padStart(2, '0')
  const minute = String(parts[1] || '00').padStart(2, '0')

  return `${hour}:${minute}`
}

function buildAppointmentAt(contact) {
  if (contact.reminder_at) {
    const fromReminderAt = new Date(contact.reminder_at)

    if (!Number.isNaN(fromReminderAt.getTime())) {
      return fromReminderAt
    }
  }

  const dateText = normalizeDate(contact.reminder_date)
  const timeText = normalizeTime(contact.reminder_time)

  if (!dateText) return null

  const date = new Date(`${dateText}T${timeText}:00+07:00`)

  if (Number.isNaN(date.getTime())) return null

  return date
}

function subtractMinutes(date, minutes) {
  return new Date(date.getTime() - minutes * 60 * 1000)
}

function buildMessage(contact, label) {
  const message = cleanText(contact.message)

  if (message) return message

  return `${label}: Halo ${cleanText(contact.name || 'Customer')}, ini pengingat jadwal Anda.`
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

    const rawTypes = Array.isArray(body.schedule_types)
      ? body.schedule_types
      : Array.isArray(body.scheduleTypes)
        ? body.scheduleTypes
        : []

    const configs = rawTypes.map(getScheduleConfig).filter(Boolean)

    if (!databaseId) {
      return res.status(400).json({
        success: false,
        message: 'database_id wajib diisi.'
      })
    }

    if (!configs.length) {
      return res.status(400).json({
        success: false,
        message: 'Pilih minimal 1 jadwal reminder.'
      })
    }

    const contactsResult = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('database_id', databaseId)
      .limit(10000)

    if (contactsResult.error) {
      return res.status(500).json({
        success: false,
        message: contactsResult.error.message
      })
    }

    const contacts = Array.isArray(contactsResult.data) ? contactsResult.data : []
    const rows = []
    const skipped = []

    for (const contact of contacts) {
      const phone = cleanPhone(contact.phone)

      if (!contact.id || !phone) {
        skipped.push({
          contact_id: contact.id || null,
          phone,
          reason: 'Kontak tidak punya phone.'
        })
        continue
      }

      const appointmentAt = buildAppointmentAt(contact)

      if (!appointmentAt) {
        skipped.push({
          contact_id: contact.id,
          phone,
          reason: 'reminder_date/reminder_time/reminder_at tidak valid.'
        })
        continue
      }

      for (const config of configs) {
        const offsetScheduledAt = subtractMinutes(appointmentAt, config.offset_minutes)

        rows.push({
          database_id: databaseId,
          contact_id: contact.id,
          schedule_type: config.schedule_type,
          schedule_label: config.schedule_label,

          // Ini jam appointment asli dari CSV.
          appointment_at: appointmentAt.toISOString(),

          // Ini jam reminder offset H-3/H-1/H-7.
          // Tetap disimpan sebagai info schedule.
          scheduled_at: offsetScheduledAt.toISOString(),

          status: 'scheduled',
          phone,
          name: cleanText(contact.name),
          message: buildMessage(contact, config.schedule_label),
          attachment_url: cleanText(contact.attachment_url) || null,
          attachment_type: cleanText(contact.attachment_type) || null,
          attachment_filename: cleanText(contact.attachment_filename) || null,
          attachment_caption: cleanText(contact.attachment_caption) || null,
          updated_at: new Date().toISOString()
        })
      }
    }

    if (rows.length) {
      const upsertResult = await supabaseAdmin
        .from('reminder_schedules')
        .upsert(rows, {
          onConflict: 'contact_id,schedule_type',
          ignoreDuplicates: true
        })

      if (upsertResult.error) {
        return res.status(500).json({
          success: false,
          message: upsertResult.error.message
        })
      }
    }

    return res.status(200).json({
      success: true,
      database_id: databaseId,
      contacts: contacts.length,
      schedules_created_or_existing: rows.length,
      skipped: skipped.slice(0, 20)
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal generate reminder schedule.'
    })
  }
}