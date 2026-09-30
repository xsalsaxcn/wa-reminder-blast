import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'
import { requireClientContext } from '../../../lib/clientScope'

function cleanText(value) {
  return String(value || '').trim()
}

async function safeMediaAssets() {
  try {
    const result = await supabaseAdmin
      .from('wa_media_assets')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(200)

    if (result.error) return []

    return result.data || []
  } catch (error) {
    return []
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    const authUser = await requireRole(req, res, ['master', 'admin', 'user', 'agent'])
    if (!authUser) return

    const context = await requireClientContext(req, res, authUser)
    if (!context) return

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const databasesResult = await supabaseAdmin
      .from('contact_databases')
      .select('*')
      .eq('client_id', context.clientId)
      .eq('type', 'blast')
      .order('created_at', { ascending: false })

    if (databasesResult.error) {
      return res.status(500).json({
        success: false,
        message: databasesResult.error.message,
        source: 'contact_databases'
      })
    }

    const templatesResult = await supabaseAdmin
      .from('wa_templates')
      .select('*')
      .order('updated_at', { ascending: false })

    if (templatesResult.error) {
      return res.status(500).json({
        success: false,
        message: templatesResult.error.message,
        source: 'wa_templates'
      })
    }

    const templates = (templatesResult.data || []).filter((template) => {
      return cleanText(template.status).toUpperCase() === 'APPROVED'
    })

    const mediaAssets = await safeMediaAssets()

    return res.status(200).json({
      success: true,
      databases: databasesResult.data || [],
      templates,
      media_assets: mediaAssets,
      debug: {
        database_count: (databasesResult.data || []).length,
        local_template_count: (templatesResult.data || []).length,
        approved_template_count: templates.length,
        media_asset_count: mediaAssets.length
      }
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memuat template blast options.'
    })
  }
}