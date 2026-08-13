/**
 * NOTIVA - iServe Module Health Check
 *
 * Endpoint:
 *
 * GET /api/iserve/health
 *
 * Endpoint ini TIDAK melakukan koneksi
 * ke iServe.
 *
 * Endpoint ini hanya memastikan
 * isolated module sudah terpasang.
 */

import {
  getSafeIServeConfig
} from '../../../lib/iserve/config'


export default function handler(
  req,
  res
) {
  if (req.method !== 'GET') {
    res.setHeader(
      'Allow',
      ['GET']
    )

    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  const config =
    getSafeIServeConfig()

  return res.status(200).json({
    success: true,

    module: 'iserve',

    status: 'READY',

    isolation: true,

    connection:
      config.enabled
        ? 'ENABLED'
        : 'DISABLED',

    configuration: {
      baseUrlConfigured:
        config.baseUrlConfigured,

      tokenConfigured:
        config.tokenConfigured
    },

    features: {
      sync:
        config.syncEnabled
          ? 'ENABLED'
          : 'DISABLED',

      webhook:
        config.webhookEnabled
          ? 'ENABLED'
          : 'DISABLED',

      reminderIntegration:
        config.reminderEnabled
          ? 'ENABLED'
          : 'DISABLED',

      marketingIntegration:
        config.marketingEnabled
          ? 'ENABLED'
          : 'DISABLED'
    },

    existingNotivaIntegration:
      'NOT_CONNECTED',

    databaseIntegration:
      'NOT_CONNECTED',

    whatsappIntegration:
      'NOT_CONNECTED',

    timestamp:
      new Date().toISOString()
  })
}