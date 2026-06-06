import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin', 'user'])
  if (!authUser) return

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const { type, databaseId } = req.body

    if (!type || !['reminder', 'blast'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'type harus reminder atau blast'
      })
    }

    if (!databaseId) {
      return res.status(400).json({
        success: false,
        message: 'databaseId wajib diisi'
      })
    }

    const { data: contacts, error: contactsError } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('database_id', databaseId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })

    if (contactsError) throw contactsError

    if (!contacts || contacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Kontak kosong'
      })
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from('send_jobs')
      .insert({
        type,
        database_id: databaseId,
        status: 'pending',
        total: contacts.length,
        sent: 0,
        failed: 0
      })
      .select()
      .single()

    if (jobError) throw jobError

    const items = contacts.map((contact) => ({
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

    return res.status(200).json({
      success: true,
      message: `Job berhasil dibuat untuk ${contacts.length} kontak`,
      job
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal membuat job'
    })
  }
}
