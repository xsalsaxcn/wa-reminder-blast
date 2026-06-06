import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin', 'user'])
  if (!authUser) return

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const { databaseId, page = 1, pageSize = 25 } = req.query

    if (!databaseId) {
      return res.status(400).json({
        success: false,
        message: 'databaseId wajib diisi'
      })
    }

    const safePageSize = Math.min(Math.max(Number(pageSize || 25), 1), 100)
    const safePage = Math.max(Number(page || 1), 1)
    const from = (safePage - 1) * safePageSize
    const to = from + safePageSize - 1

    const { data, error, count } = await supabaseAdmin
      .from('contacts')
      .select('*', { count: 'exact' })
      .eq('database_id', databaseId)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error

    return res.status(200).json({
      success: true,
      data: data || [],
      pagination: {
        page: safePage,
        pageSize: safePageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / safePageSize)
      }
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal mengambil contacts'
    })
  }
}
