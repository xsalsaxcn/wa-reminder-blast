/**
 * NOTIVA - iServe Integration
 *
 * Configuration module khusus iServe.
 *
 * SAFETY:
 * Semua feature default DISABLED.
 * Modul iServe dibuat terpisah dan tidak boleh
 * mempengaruhi Reminder, Blast, Inbox, Jobs,
 * WhatsApp Sender, atau fitur NOTIVA existing.
 */

export function getIServeConfig() {
  return {
    enabled:
      process.env.ISERVE_ENABLED === 'true',

    baseUrl:
      process.env.ISERVE_BASE_URL || '',

    apiToken:
      process.env.ISERVE_API_TOKEN || '',

    syncEnabled:
      process.env.ISERVE_SYNC_ENABLED === 'true',

    webhookEnabled:
      process.env.ISERVE_WEBHOOK_ENABLED === 'true',

    reminderEnabled:
      process.env.ISERVE_REMINDER_ENABLED === 'true',

    marketingEnabled:
      process.env.ISERVE_MARKETING_ENABLED === 'true'
  }
}


/**
 * Safe configuration untuk UI/API.
 *
 * API token TIDAK pernah dikembalikan.
 */
export function getSafeIServeConfig() {
  const config = getIServeConfig()

  return {
    enabled: config.enabled,

    baseUrlConfigured:
      Boolean(config.baseUrl),

    tokenConfigured:
      Boolean(config.apiToken),

    syncEnabled:
      config.syncEnabled,

    webhookEnabled:
      config.webhookEnabled,

    reminderEnabled:
      config.reminderEnabled,

    marketingEnabled:
      config.marketingEnabled
  }
}