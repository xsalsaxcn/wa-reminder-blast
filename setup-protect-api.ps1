@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin', 'user'])
  if (!authUser) return

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const { type } = req.query

    let query = supabaseAdmin
      .from('contact_databases')
      .select('*')
      .order('created_at', { ascending: false })

    if (type) {
      query = query.eq('type', type)
    }

    const { data, error } = await query

    if (error) throw error

    return res.status(200).json({
      success: true,
      data: data || []
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch databases'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\contacts\list.js"

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function cleanPhone(phone) {
  if (!phone) return ''
  let value = String(phone).trim()
  value = value.replace(/[^\d+]/g, '')

  if (value.startsWith('0')) {
    value = '62' + value.slice(1)
  }

  if (value.startsWith('+')) {
    value = value.slice(1)
  }

  return value
}

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin'])
  if (!authUser) return

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const { databaseName, type, contacts } = req.body

    if (!databaseName || !type) {
      return res.status(400).json({
        success: false,
        message: 'databaseName dan type wajib diisi'
      })
    }

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'contacts kosong'
      })
    }

    const validContacts = contacts
      .map((row) => ({
        name: row.name || row.nama || '',
        phone: cleanPhone(row.phone || row.nomor || row.no_hp || row.whatsapp),
        message: row.message || row.pesan || '',
        reminder_date: row.reminder_date || row.tanggal || null,
        reminder_time: row.reminder_time || row.jam || null,
        status: 'active'
      }))
      .filter((row) => row.phone)

    if (validContacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tidak ada nomor WhatsApp valid'
      })
    }

    const { data: database, error: dbError } = await supabaseAdmin
      .from('contact_databases')
      .insert({
        name: databaseName,
        type,
        total_contacts: validContacts.length
      })
      .select()
      .single()

    if (dbError) throw dbError

    const contactsToInsert = validContacts.map((contact) => ({
      ...contact,
      database_id: database.id
    }))

    const { error: contactsError } = await supabaseAdmin
      .from('contacts')
      .insert(contactsToInsert)

    if (contactsError) throw contactsError

    return res.status(200).json({
      success: true,
      message: `Berhasil import ${validContacts.length} kontak`,
      database
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Import gagal'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\contacts\import.js"

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin', 'user'])
  if (!authUser) return

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  }

  try {
    const { start, end } = req.query

    let query = supabaseAdmin
      .from('reminder_logs')
      .select('*')
      .order('sent_at', { ascending: false })

    if (start) query = query.gte('sent_at', start)
    if (end) query = query.lte('sent_at', end)

    const { data, error } = await query

    if (error) throw error

    return res.status(200).json({
      success: true,
      data: data || []
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal mengambil reminder log'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\reminder\log.js"

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin', 'user'])
  if (!authUser) return

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  }

  try {
    const { start, end } = req.query

    let query = supabaseAdmin
      .from('blast_logs')
      .select('*')
      .order('sent_at', { ascending: false })

    if (start) query = query.gte('sent_at', start)
    if (end) query = query.lte('sent_at', end)

    const { data, error } = await query

    if (error) throw error

    return res.status(200).json({
      success: true,
      data: data || []
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal mengambil blast log'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\blast\log.js"

Write-Host "API list, import, dan log sudah diproteksi."