import { requireRole } from '../../../lib/auth'
import { removeBlacklist } from '../../../lib/blacklist'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')

  try {
    await requireRole(req, res, ['master', 'admin', 'user', 'agent'])

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const { phone } = req.body || {}

    await removeBlacklist(phone)

    return res.status(200).json({
      success: true
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to remove blacklist'
    })
  }
}