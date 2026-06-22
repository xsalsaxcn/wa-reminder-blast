import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { requireRole } from '../../../../lib/auth'

function cleanText(value) {
  return String(value || '').trim()
}

function getGraphVersion() {
  return cleanText(process.env.META_GRAPH_VERSION) || 'v20.0'
}

function getToken() {
  return (
    cleanText(process.env.META_WA_TOKEN) ||
    cleanText(process.env.WHATSAPP_TOKEN) ||
    cleanText(process.env.META_ACCESS_TOKEN)
  )
}

function getWabaId() {
  return (
    cleanText(process.env.META_WABA_ID) ||
    cleanText(process.env.META_WA_WABA_ID) ||
    cleanText(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID) ||
    '243741338818420'
  )
}

async function readJson(response) {
  const text = await response.text()

  try {
    return JSON.parse(text)
  } catch (error) {
    return {
      raw: text
    }
  }
}

function inferHeaderType(components) {
  if (!Array.isArray(components)) return 'NONE'

  const header = components.find((component) => component.type === 'HEADER')

  if (!header) return 'NONE'

  return cleanText(header.format || 'NONE').toUpperCase() || 'NONE'
}

function inferBody(components) {
  if (!Array.isArray(components)) return ''

  const body = components.find((component) => component.type === 'BODY')

  return cleanText(body?.text)
}

function inferFooter(components) {
  if (!Array.isArray(components)) return ''

  const footer = components.find((component) => component.type === 'FOOTER')

  return cleanText(footer?.text)
}

function getQualityScore(value) {
  if (!value) return null

  if (typeof value === 'string') return value

  if (value.score) return cleanText(value.score)

  return JSON.stringify(value)
}

async function syncFromMeta() {
  const token = getToken()
  const wabaId = getWabaId()
  const version = getGraphVersion()

  if (!token) {
    throw new Error('META_WA_TOKEN belum diset di environment.')
  }

  const url = new URL(`https://graph.facebook.com/${version}/${wabaId}/message_templates`)
  url.searchParams.set(
    'fields',
    'id,name,language,category,status,rejected_reason,quality_score,components'
  )
  url.searchParams.set('limit', '100')

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  const data = await readJson(response)

  if (!response.ok) {
    throw new Error(data.error?.message || 'Gagal sync template dari Meta.')
  }

  const templates = Array.isArray(data.data) ? data.data : []

  if (!templates.length) {
    return {
      synced: 0,
      meta: data
    }
  }

  const rows = templates.map((template) => ({
    meta_template_id: cleanText(template.id) || null,
    name: cleanText(template.name),
    language: cleanText(template.language) || 'id',
    category: cleanText(template.category) || 'MARKETING',
    status: cleanText(template.status) || null,
    rejected_reason: cleanText(template.rejected_reason) || null,
    quality_score: getQualityScore(template.quality_score),
    header_type: inferHeaderType(template.components),
    body: inferBody(template.components),
    footer: inferFooter(template.components) || null,
    components: template.components || null,
    meta_response: template,
    updated_at: new Date().toISOString()
  }))

  const result = await supabaseAdmin
    .from('wa_templates')
    .upsert(rows, {
      onConflict: 'name,language'
    })

  if (result.error) {
    throw new Error(result.error.message)
  }

  return {
    synced: rows.length,
    meta: data
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    const authUser = await requireRole(req, res, ['master', 'admin', 'user', 'agent'])
    if (!authUser) return

    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    let syncResult = null
    const shouldSync = cleanText(req.query.sync || req.body?.sync || '1') !== '0'

    if (shouldSync) {
      syncResult = await syncFromMeta()
    }

    const result = await supabaseAdmin
      .from('wa_templates')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(500)

    if (result.error) {
      return res.status(500).json({
        success: false,
        message: result.error.message
      })
    }

    return res.status(200).json({
      success: true,
      sync: syncResult,
      templates: result.data || [],
      rows: result.data || []
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memuat Meta templates.'
    })
  }
}