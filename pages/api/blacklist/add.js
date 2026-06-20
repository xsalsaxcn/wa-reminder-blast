import { requireRole } from '../../../lib/auth'
import { upsertBlacklist } from '../../../lib/blacklist'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')

  try {
    const user = await requireRole(req, res, ['master', 'admin', 'user', 'agent'])

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const { phone, profile_name, reason, source } = req.body || {}

    const row = await upsertBlacklist({
      phone,
      profile_name,
      reason: reason || 'Manual blacklist',
      source: source || 'manual',
      created_by: user?.username || null
    })

    return res.status(200).json({
      success: true,
      row
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to add blacklist'
    })
  }
}