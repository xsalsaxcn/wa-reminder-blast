import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master'])
  if (!authUser) return

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    await supabaseAdmin.from('reminder_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabaseAdmin.from('blast_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabaseAdmin.from('contacts').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabaseAdmin.from('contact_databases').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    return res.status(200).json({
      success: true,
      message: 'Database kontak, reminder log, dan blast log berhasil direset. User dan WhatsApp settings tidak dihapus.'
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Reset database gagal'
    })
  }
}
