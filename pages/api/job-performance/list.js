import { requireRole } from '../../../lib/auth'
import { buildJobPerformanceRows } from '../../../lib/jobPerformanceBuilder'

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

    const result = await buildJobPerformanceRows({
      start: req.query.start || '',
      end: req.query.end || '',
      type: req.query.type || 'all',
      status: req.query.status || 'all',
      q: req.query.q || '',
      limit: req.query.limit || 200
    })

    return res.status(200).json({
      success: true,
      ...result
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to load job performance'
    })
  }
}