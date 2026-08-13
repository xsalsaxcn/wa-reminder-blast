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

function toPriority(value) {
  const number = Number(value)

  if (!Number.isFinite(number)) return 100

  return Math.max(1, Math.floor(number))
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')

  try {
    const authUser = requireRole(req, res, ['master', 'admin', 'user', 'agent'])
    if (!authUser) return

    if (req.method === 'GET') {
      const result = await supabaseAdmin
        .from('chatbot_faqs')
        .select('*')
        .order('priority', { ascending: true })
        .order('created_at', { ascending: false })

      if (result.error) {
        return res.status(500).json({
          success: false,
          message: result.error.message
        })
      }

      return res.status(200).json({
        success: true,
        faqs: result.data || []
      })
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      const id = cleanText(body.id)

      const payload = {
        question: cleanText(body.question),
        answer: cleanText(body.answer),
        category: cleanText(body.category) || 'General',
        keywords: parseKeywords(body.keywords),
        priority: toPriority(body.priority),
        is_active: body.is_active !== false,
        updated_at: new Date().toISOString()
      }

      if (!payload.question || !payload.answer) {
        return res.status(400).json({
          success: false,
          message: 'Question dan answer wajib diisi.'
        })
      }

      if (id) {
        const updateResult = await supabaseAdmin
          .from('chatbot_faqs')
          .update(payload)
          .eq('id', id)
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
          faq: updateResult.data
        })
      }

      const insertResult = await supabaseAdmin
        .from('chatbot_faqs')
        .insert(payload)
        .select('*')
        .single()

      if (insertResult.error) {
        return res.status(500).json({
          success: false,
          message: insertResult.error.message
        })
      }

      return res.status(200).json({
        success: true,
        faq: insertResult.data
      })
    }

    if (req.method === 'DELETE') {
      const id = cleanText(req.query.id || req.body?.id)

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'id wajib diisi.'
        })
      }

      const deleteResult = await supabaseAdmin
        .from('chatbot_faqs')
        .delete()
        .eq('id', id)

      if (deleteResult.error) {
        return res.status(500).json({
          success: false,
          message: deleteResult.error.message
        })
      }

      return res.status(200).json({
        success: true
      })
    }

    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memproses FAQ chatbot.'
    })
  }
}