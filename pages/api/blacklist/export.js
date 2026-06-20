import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function csvEscape(value) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')

  try {
    await requireRole(req, res, ['master', 'admin', 'user', 'agent'])

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const { data, error } = await supabaseAdmin
      .from('wa_blacklist')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10000)

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      })
    }

    const header = [
      'phone',
      'profile_name',
      'reason',
      'source',
      'created_by',
      'created_at'
    ]

    const lines = [
      header.map(csvEscape).join(','),
      ...(data || []).map((row) =>
        [
          row.phone,
          row.profile_name,
          row.reason,
          row.source,
          row.created_by,
          row.created_at
        ].map(csvEscape).join(',')
      )
    ]

    const csv = '\ufeff' + lines.join('\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="wa_blacklist.csv"')

    return res.status(200).send(csv)
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Unauthorized'
    })
  }
}