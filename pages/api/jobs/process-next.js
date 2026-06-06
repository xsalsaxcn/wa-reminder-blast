import { processNextJob } from '../../../lib/jobProcessor'

function isAuthorized(req) {
  const expected = process.env.JOB_RUNNER_SECRET
  const headerSecret = req.headers['x-job-runner-secret']
  const querySecret = req.query.secret

  if (!expected) return false

  return headerSecret === expected || querySecret === expected
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized runner'
    })
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const type = req.query.type || req.body?.type || null
    const limit = req.query.limit || req.body?.limit || process.env.JOB_BATCH_LIMIT || 10

    const result = await processNextJob({
      type,
      limit
    })

    return res.status(200).json({
      ...result,
      runner: true
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Auto runner failed',
      runner: true
    })
  }
}
