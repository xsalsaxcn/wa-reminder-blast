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

  return text
}

function getScheduleLabel(type) {
  const normalized = normalizeScheduleType(type)

  if (normalized === 'H-3') return 'Reminder H-3'
  if (normalized === 'H-1') return 'Reminder H-1'
  if (normalized === 'H-7JAM') return 'Reminder H-7 Jam'

  return normalized || 'Reminder'
}

function groupByScheduleType(rows) {
  const map = new Map()

  for (const row of rows) {
    const key = normalizeScheduleType(row.schedule_type)

    if (!map.has(key)) {
      map.set(key, [])
    }

    map.get(key).push(row)
  }

  return Array.from(map.entries()).map(([scheduleType, items]) => ({
    scheduleType,
    items
  }))
}

function buildMessage(schedule) {
  const message = cleanText(schedule.message)

  if (message) return message

  return `${getScheduleLabel(schedule.schedule_type)}: Halo ${cleanText(schedule.name || 'Customer')}, ini pengingat jadwal Anda.`
}

function getCsvScheduledAt(schedule) {
  const appointmentAt = cleanText(schedule.appointment_at)

  if (!appointmentAt) return null

  const date = new Date(appointmentAt)

  if (Number.isNaN(date.getTime())) return null

  return date.toISOString()
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

    const selectedTypes = Array.isArray(body.schedule_types)
      ? body.schedule_types.map(normalizeScheduleType)
      : Array.isArray(body.scheduleTypes)
        ? body.scheduleTypes.map(normalizeScheduleType)
        : []

    if (!databaseId) {
      return res.status(400).json({
        success: false,
        message: 'database_id wajib diisi.'
      })
    }

    if (!selectedTypes.length) {
      return res.status(400).json({
        success: false,
        message: 'Pilih minimal 1 jadwal reminder.'
      })
    }

    const schedulesResult = await supabaseAdmin
      .from('reminder_schedules')
      .select('*')
      .eq('database_id', databaseId)
      .eq('status', 'scheduled')
      .in('schedule_type', selectedTypes)
      .limit(10000)

    if (schedulesResult.error) {
      return res.status(500).json({
        success: false,
        message: schedulesResult.error.message
      })
    }

    const schedules = Array.isArray(schedulesResult.data) ? schedulesResult.data : []

    if (!schedules.length) {
      return res.status(200).json({
        success: true,
        message: 'Tidak ada schedule baru untuk dibuat job. Mungkin sudah pernah dibuat.',
        jobs_created: 0,
        items_created: 0
      })
    }

    const groups = groupByScheduleType(schedules)
    const createdJobs = []
    let itemsCreated = 0
    const skipped = []

    for (const group of groups) {
      const label = getScheduleLabel(group.scheduleType)
      const jobName = `${label} - ${new Date().toLocaleString('id-ID')}`

      const validSchedules = group.items.filter((schedule) => {
        const csvScheduledAt = getCsvScheduledAt(schedule)

        if (!csvScheduledAt) {
          skipped.push({
            schedule_id: schedule.id,
            phone: schedule.phone,
            reason: 'appointment_at kosong/tidak valid. Job item tidak dibuat.'
          })

          return false
        }

        return true
      })

      if (!validSchedules.length) {
        continue
      }

      const jobResult = await supabaseAdmin
        .from('send_jobs')
        .insert({
          name: jobName,
          title: jobName,
          type: 'reminder',
          status: 'pending',
          database_id: databaseId,
          total_items: validSchedules.length
        })
        .select('*')
        .single()

      if (jobResult.error) {
        return res.status(500).json({
          success: false,
          message: jobResult.error.message
        })
      }

      const job = jobResult.data

      const jobItems = validSchedules
        .map((schedule) => {
          const phone = cleanPhone(schedule.phone)
          const message = buildMessage(schedule)
          const csvScheduledAt = getCsvScheduledAt(schedule)

          if (!phone || !message || !csvScheduledAt) return null

          return {
            job_id: job.id,
            phone,
            message,
            status: 'pending',

            // WAJIB: mode "Sesuai Jadwal CSV" baca dari field ini.
            // Ini appointment_at dari CSV asli: reminder_date + reminder_time.
            scheduled_at: csvScheduledAt,

            attachment_url: cleanText(schedule.attachment_url) || null,
            attachment_type: cleanText(schedule.attachment_type) || null,
            attachment_filename: cleanText(schedule.attachment_filename) || null,
            attachment_caption: cleanText(schedule.attachment_caption) || message
          }
        })
        .filter(Boolean)

      if (jobItems.length) {
        const itemResult = await supabaseAdmin
          .from('send_job_items')
          .insert(jobItems)

        if (itemResult.error) {
          return res.status(500).json({
            success: false,
            message: itemResult.error.message
          })
        }
      }

      const scheduleIds = validSchedules.map((item) => item.id)

      const updateResult = await supabaseAdmin
        .from('reminder_schedules')
        .update({
          status: 'queued',
          job_id: job.id,
          queued_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .in('id', scheduleIds)

      if (updateResult.error) {
        return res.status(500).json({
          success: false,
          message: updateResult.error.message
        })
      }

      createdJobs.push(job)
      itemsCreated += jobItems.length
    }

    return res.status(200).json({
      success: true,
      database_id: databaseId,
      jobs_created: createdJobs.length,
      items_created: itemsCreated,
      skipped,
      jobs: createdJobs.map((job) => ({
        id: job.id,
        name: job.name || job.title,
        total_items: job.total_items
      }))
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal create job reminder langsung.'
    })
  }
}