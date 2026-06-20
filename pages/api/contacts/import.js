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
  const authUser = requireRole(req, res, ['master', 'admin', 'agent'])
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

    const maxImportContacts = Number(process.env.MAX_IMPORT_CONTACTS || 5000)

    if (contacts.length > maxImportContacts) {
      return res.status(400).json({
        success: false,
        message: `Import ditolak. Maksimal ${maxImportContacts} kontak per upload. File ini berisi ${contacts.length} baris. Pecah file menjadi beberapa batch.`
      })
    }

    const seenPhones = new Set()

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
      .filter((row) => {
        if (seenPhones.has(row.phone)) return false
        seenPhones.add(row.phone)
        return true
      })

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
      message: `Berhasil import ${validContacts.length} kontak. Duplikat nomor dalam file otomatis dilewati.`,
      database
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Import gagal'
    })
  }
}
