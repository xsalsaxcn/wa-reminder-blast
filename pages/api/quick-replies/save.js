import { randomUUID } from 'crypto'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function makeKey(label) {
  const base = String(label || 'template')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

  return `${base || 'template'}-${Date.now()}`
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')

  try {
    const user = await requireRole(req, res, ['master', 'admin', 'user', 'agent'])

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const {
      id,
      label,
      question,
      answer,
      category,
      sort_order,
      is_active
    } = req.body || {}

    const cleanLabel = String(label || '').trim()
    const cleanAnswer = String(answer || '').trim()

    if (!cleanLabel) {
      return res.status(400).json({
        success: false,
        message: 'Label wajib diisi'
      })
    }

    if (!cleanAnswer) {
      return res.status(400).json({
        success: false,
        message: 'Answer / isi balasan wajib diisi'
      })
    }

    if (id) {
      const { data, error } = await supabaseAdmin
        .from('quick_reply_templates')
        .update({
          label: cleanLabel,
          question: String(question || '').trim(),
          answer: cleanAnswer,
          category: String(category || 'General').trim() || 'General',
          sort_order: Number(sort_order || 0),
          is_active: Boolean(is_active),
          updated_by: user?.username || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        return res.status(500).json({
          success: false,
          message: error.message
        })
      }

      return res.status(200).json({
        success: true,
        row: data
      })
    }

    const { data, error } = await supabaseAdmin
      .from('quick_reply_templates')
      .insert({
        template_key: makeKey(cleanLabel) || randomUUID(),
        label: cleanLabel,
        question: String(question || '').trim(),
        answer: cleanAnswer,
        category: String(category || 'General').trim() || 'General',
        sort_order: Number(sort_order || 0),
        is_active: Boolean(is_active),
        created_by: user?.username || null,
        updated_by: user?.username || null
      })
      .select()
      .single()

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      })
    }

    return res.status(200).json({
      success: true,
      row: data
    })
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Unauthorized'
    })
  }
}