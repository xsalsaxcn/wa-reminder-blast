import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin'])
  if (!authUser) return

  try {
    if (req.method === 'GET') {
      const { type } = req.query

      let query = supabaseAdmin
        .from('whatsapp_settings')
        .select('*')
        .order('type', { ascending: true })

      if (type) {
        query = query.eq('type', type)
      }

      const { data, error } = await query

      if (error) throw error

      return res.status(200).json({
        success: true,
        data: type ? data?.[0] || null : data || []
      })
    }

    if (req.method === 'POST') {
      const {
        type,
        message_mode,
        template_name,
        language_code,
        template_variables,
        default_message
      } = req.body

      if (!type || !['reminder', 'blast'].includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'type harus reminder atau blast'
        })
      }

      const payload = {
        type,
        message_mode: message_mode || 'text',
        template_name: template_name || null,
        language_code: language_code || 'id',
        template_variables: Array.isArray(template_variables) ? template_variables : [],
        default_message: default_message || '',
        updated_at: new Date().toISOString()
      }

      const { data, error } = await supabaseAdmin
        .from('whatsapp_settings')
        .upsert(payload, { onConflict: 'type' })
        .select()
        .single()

      if (error) throw error

      return res.status(200).json({
        success: true,
        message: 'WhatsApp setting berhasil disimpan',
        data
      })
    }

    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    })
  }
}
