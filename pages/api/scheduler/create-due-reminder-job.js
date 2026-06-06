import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function getLocalNow() {
  const offsetHours = Number(process.env.APP_TIMEZONE_OFFSET_HOURS || 7)
  const now = new Date()
  const local = new Date(now.getTime() + offsetHours * 60 * 60 * 1000)

  const yyyy = local.getUTCFullYear()
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(local.getUTCDate()).padStart(2, '0')
  const hh = String(local.getUTCHours()).padStart(2, '0')
  const mi = String(local.getUTCMinutes()).padStart(2, '0')

  return {
    date: `${yyyy}-${mm}-${dd}`,
    time: `${hh}:${mi}`,
    iso: local.toISOString()
  }
}

function isDue(contact, localNow) {
  if (!contact.reminder_date) return false

  const date = contact.reminder_date
  const time = contact.reminder_time ? String(contact.reminder_time).slice(0, 5) : '00:00'

  if (date < localNow.date) return true
  if (date === localNow.date && time <= localNow.time) return true

  return false
}

async function createReminderJobForDueContacts({ limit = 50 } = {}) {
  const localNow = getLocalNow()
  const batchLimit = Math.min(Math.max(Number(limit || 50), 1), 200)

  const { data: reminderDbs, error: dbError } = await supabaseAdmin
    .from('contact_databases')
    .select('id, name')
    .eq('type', 'reminder')

  if (dbError) throw dbError

  const reminderDbIds = (reminderDbs || []).map((db) => db.id)

  if (reminderDbIds.length === 0) {
    return {
      success: true,
      message: 'Tidak ada database reminder',
      created: false,
      localNow
    }
  }

  const { data: contacts, error: contactsError } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .in('database_id', reminderDbIds)
    .eq('status', 'active')
    .not('reminder_date', 'is', null)
    .order('reminder_date', { ascending: true })
    .order('reminder_time', { ascending: true })
    .limit(1000)

  if (contactsError) throw contactsError

  const dueContactsRaw = (contacts || []).filter((contact) => isDue(contact, localNow))

  if (dueContactsRaw.length === 0) {
    return {
      success: true,
      message: 'Belum ada reminder yang due',
      created: false,
      due: 0,
      localNow
    }
  }

  const contactIds = dueContactsRaw.map((contact) => contact.id)

  const { data: locks, error: locksError } = await supabaseAdmin
    .from('reminder_dispatch_locks')
    .select('contact_id')
    .in('contact_id', contactIds)

  if (locksError) throw locksError

  const lockedIds = new Set((locks || []).map((lock) => lock.contact_id))

  const dueContacts = dueContactsRaw
    .filter((contact) => !lockedIds.has(contact.id))
    .slice(0, batchLimit)

  if (dueContacts.length === 0) {
    return {
      success: true,
      message: 'Semua reminder due sudah pernah dibuatkan job',
      created: false,
      due: dueContactsRaw.length,
      localNow
    }
  }

  const databaseId = dueContacts[0].database_id

  const { data: job, error: jobError } = await supabaseAdmin
    .from('send_jobs')
    .insert({
      type: 'reminder',
      database_id: databaseId,
      status: 'pending',
      total: dueContacts.length,
      sent: 0,
      failed: 0
    })
    .select()
    .single()

  if (jobError) throw jobError

  const items = dueContacts.map((contact) => ({
    job_id: job.id,
    contact_id: contact.id,
    phone: contact.phone,
    message: contact.message || null,
    status: 'pending'
  }))

  const { error: itemsError } = await supabaseAdmin
    .from('send_job_items')
    .insert(items)

  if (itemsError) throw itemsError

  const locksToInsert = dueContacts.map((contact) => ({
    contact_id: contact.id,
    database_id: contact.database_id,
    reminder_date: contact.reminder_date,
    reminder_time: contact.reminder_time,
    job_id: job.id
  }))

  const { error: lockInsertError } = await supabaseAdmin
    .from('reminder_dispatch_locks')
    .insert(locksToInsert)

  if (lockInsertError) throw lockInsertError

  return {
    success: true,
    message: `Auto reminder job dibuat untuk ${dueContacts.length} kontak`,
    created: true,
    job,
    due: dueContacts.length,
    localNow
  }
}

function isRunnerAuthorized(req) {
  const expected = process.env.JOB_RUNNER_SECRET
  const headerSecret = req.headers['x-job-runner-secret']
  const querySecret = req.query.secret

  if (!expected) return false

  return headerSecret === expected || querySecret === expected
}

export default async function handler(req, res) {
  const isManualAdmin = req.method === 'POST' && req.headers.cookie
  const isRunner = isRunnerAuthorized(req)

  if (!isRunner && isManualAdmin) {
    const authUser = requireRole(req, res, ['master', 'admin'])
    if (!authUser) return
  }

  if (!isRunner && !isManualAdmin) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized scheduler'
    })
  }

  try {
    const limit =
      req.query.limit ||
      req.body?.limit ||
      process.env.AUTO_REMINDER_BATCH_SIZE ||
      50

    const result = await createReminderJobForDueContacts({ limit })

    return res.status(200).json({
      ...result,
      scheduler: true
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Scheduler gagal',
      scheduler: true
    })
  }
}
