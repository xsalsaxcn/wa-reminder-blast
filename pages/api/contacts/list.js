import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'
import { requireClientContext } from '../../../lib/clientScope'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin', 'user'])
  if (!authUser) return

  const context = await requireClientContext(req, res, authUser)
  if (!context) return

  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' })

  try {
    const { type } = req.query

    let query = supabaseAdmin
      .from('contact_databases')
      .select('*')
      .eq('client_id', context.clientId)
      .order('created_at', { ascending: false })

    if (type) query = query.eq('type', type)

    const { data, error } = await query
    if (error) throw error

    return res.status(200).json({ success: true, data: data || [] })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch databases' })
  }
}
