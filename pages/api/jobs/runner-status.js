import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin'])
  if (!authUser) return

  try {
    const { data: jobs, error } = await supabaseAdmin
      .from('send_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw error

    const summary = {
      total: jobs?.length || 0,
      pending: jobs?.filter((job) => job.status === 'pending').length || 0,
      processing: jobs?.filter((job) => job.status === 'processing').length || 0,
      done: jobs?.filter((job) => job.status === 'done').length || 0,
      failed: jobs?.filter((job) => job.status === 'failed').length || 0
    }

    return res.status(200).json({
      success: true,
      summary,
      jobs: jobs || []
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to load runner status'
    })
  }
}
