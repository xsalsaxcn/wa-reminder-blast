import { requireRole } from '../../lib/auth'
import {
  listActiveClients,
  requireClientContext,
  setActiveClientCookie
} from '../../lib/clientScope'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')

  try {
    const authUser = requireRole(req, res, ['master', 'admin', 'user', 'agent'])
    if (!authUser) return

    if (req.method === 'GET') {
      const context = await requireClientContext(req, res, authUser)
      if (!context) return

      const clients = context.canSwitch
        ? await listActiveClients()
        : [context.client]

      return res.status(200).json({
        success: true,
        current_client: context.client,
        can_switch: context.canSwitch,
        clients
      })
    }

    if (req.method === 'POST') {
      if (String(authUser.role || '').toLowerCase() !== 'master') {
        return res.status(403).json({
          success: false,
          message: 'Hanya Master yang dapat mengganti active client.'
        })
      }

      const clientId = String(req.body?.client_id || req.body?.clientId || '').trim()

      if (!clientId) {
        return res.status(400).json({
          success: false,
          message: 'client_id wajib diisi.'
        })
      }

      const client = await setActiveClientCookie(res, clientId)

      return res.status(200).json({
        success: true,
        current_client: client
      })
    }

    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Gagal memproses client context.'
    })
  }
}
