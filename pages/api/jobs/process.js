import { requireRole } from '../../../lib/auth'
import { processJobBatch } from '../../../lib/jobProcessor'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin', 'user', 'agent'])
  if (!authUser) return

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const { jobId, limit } = req.body

    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: 'jobId wajib diisi'
      })
    }

    const result = await processJobBatch({
      jobId,
      limit: limit || process.env.JOB_BATCH_LIMIT || 10
    })

    return res.status(200).json(result)
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memproses job'
    })
  }
}
