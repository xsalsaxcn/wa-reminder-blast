import { requireRole } from '../../../lib/auth'
import { buildUsageRows } from '../../../lib/usageBuilder'

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

    const result = await buildUsageRows({
      start: req.query.start || '',
      end: req.query.end || '',
      source: req.query.source || 'all',
      status: req.query.status || 'all',
      job_id: req.query.job_id || '',
      limit: req.query.limit || 5000
    })

    return res.status(200).json({
      success: true,
      ...result
    })
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Unauthorized'
    })
  }
}