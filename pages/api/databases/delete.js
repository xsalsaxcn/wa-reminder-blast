import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'
import { requireClientContext } from '../../../lib/clientScope'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin'])
  if (!authUser) return

  const context = await requireClientContext(req, res, authUser)
  if (!context) return

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  }

  try {
    const { databaseId } = req.body

    if (!databaseId) return res.status(400).json({ success: false, message: 'databaseId wajib diisi' })

    const { data: database, error: dbError } = await supabaseAdmin
      .from('contact_databases')
      .select('*')
      .eq('id', databaseId)
      .eq('client_id', context.clientId)
      .maybeSingle()

    if (dbError) throw dbError
    if (!database) return res.status(404).json({ success: false, message: 'Database tidak ditemukan pada client aktif' })

    const { error } = await supabaseAdmin
      .from('contact_databases')
      .delete()
      .eq('id', databaseId)
      .eq('client_id', context.clientId)

    if (error) throw error

    return res.status(200).json({
      success: true,
      message: `Database "${database.name}" berhasil dihapus. Contacts dan jobs terkait ikut terhapus. Logs lama tetap disimpan untuk audit.`
    })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Gagal menghapus database' })
  }
}
