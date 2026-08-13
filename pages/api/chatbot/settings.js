import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function cleanText(value) {
  return String(value || '').trim()
}

function parseKeywords(value) {
  if (Array.isArray(value)) {
    return value.map(cleanText).filter(Boolean)
  }

  return String(value || '')
    .split(/[,|\n]/)
    .map(cleanText)
    .filter(Boolean)
}

async function getOrCreateSettings() {
  const result = await supabaseAdmin
    .from('chatbot_settings')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (result.error) {
    throw new Error(result.error.message)
  }

  if (result.data) return result.data

  const insertResult = await supabaseAdmin
    .from('chatbot_settings')
    .insert({
      bot_enabled: false,
      auto_reply_enabled: false,
      assist_only: true,
      fallback_message: 'Terima kasih, pesan Anda sudah kami terima. Admin kami akan membantu segera.',
      handoff_keywords: ['admin', 'cs', 'operator', 'manusia', 'bantuan']
    })
    .select('*')
    .single()

  if (insertResult.error) {
    throw new Error(insertResult.error.message)
  }

  return insertResult.data
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')

  try {
    const authUser = requireRole(req, res, ['master', 'admin'])
    if (!authUser) return

    if (req.method === 'GET') {
      const settings = await getOrCreateSettings()

      return res.status(200).json({
        success: true,
        settings
      })
    }

    if (req.method === 'POST') {
      const current = await getOrCreateSettings()
      const body = req.body || {}

      const payload = {
        bot_enabled: Boolean(body.bot_enabled),
        auto_reply_enabled: Boolean(body.auto_reply_enabled),
        assist_only: body.assist_only !== false,
        fallback_message:
          cleanText(body.fallback_message) ||
          'Terima kasih, pesan Anda sudah kami terima. Admin kami akan membantu segera.',
        handoff_keywords: parseKeywords(body.handoff_keywords),
        updated_at: new Date().toISOString()
      }

      if (payload.auto_reply_enabled) {
        payload.bot_enabled = true
        payload.assist_only = false
      }

      const updateResult = await supabaseAdmin
        .from('chatbot_settings')
        .update(payload)
        .eq('id', current.id)
        .select('*')
        .single()

      if (updateResult.error) {
        return res.status(500).json({
          success: false,
          message: updateResult.error.message
        })
      }

      return res.status(200).json({
        success: true,
        settings: updateResult.data
      })
    }

    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memuat chatbot settings.'
    })
  }
}