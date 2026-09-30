import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function cleanText(value) {
  return String(value || '').trim()
}

function cleanCode(value) {
  return cleanText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeStatus(value) {
  return cleanText(value).toLowerCase() === 'inactive' ? 'inactive' : 'active'
}

function buildPayload(body, includeCode = true) {
  const payload = {
    name: cleanText(body.name),
    brand_name: cleanText(body.brand_name || body.brandName) || null,
    status: normalizeStatus(body.status),
    pic_name: cleanText(body.pic_name || body.picName) || null,
    pic_email: cleanText(body.pic_email || body.picEmail) || null,
    pic_phone: cleanText(body.pic_phone || body.picPhone) || null,
    notes: cleanText(body.notes) || null,
    updated_at: new Date().toISOString()
  }

  if (includeCode) payload.code = cleanCode(body.code)

  return payload
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')

  try {
    const authUser = requireRole(req, res, ['master'])
    if (!authUser) return

    if (req.method === 'GET') {
      const result = await supabaseAdmin
        .from('clients')
        .select('*')
        .order('created_at', { ascending: true })

      if (result.error) throw result.error

      return res.status(200).json({
        success: true,
        clients: result.data || []
      })
    }

    if (req.method === 'POST') {
      const payload = buildPayload(req.body || {}, true)

      if (!payload.code || !payload.name) {
        return res.status(400).json({
          success: false,
          message: 'Code dan nama client wajib diisi.'
        })
      }

      const result = await supabaseAdmin
        .from('clients')
        .insert(payload)
        .select('*')
        .single()

      if (result.error) throw result.error

      return res.status(200).json({
        success: true,
        client: result.data
      })
    }

    if (req.method === 'PATCH') {
      const id = cleanText(req.body?.id)

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'ID client wajib diisi.'
        })
      }

      const existingResult = await supabaseAdmin
        .from('clients')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (existingResult.error) throw existingResult.error
      if (!existingResult.data) {
        return res.status(404).json({ success: false, message: 'Client tidak ditemukan.' })
      }

      const payload = buildPayload(req.body || {}, existingResult.data.code !== 'IHC')

      if (!payload.name) {
        return res.status(400).json({
          success: false,
          message: 'Nama client wajib diisi.'
        })
      }

      if (existingResult.data.code === 'IHC') {
        delete payload.code
        if (payload.status === 'inactive') {
          return res.status(400).json({
            success: false,
            message: 'Legacy client IHC tidak boleh dinonaktifkan pada Phase 1.'
          })
        }
      }

      const result = await supabaseAdmin
        .from('clients')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single()

      if (result.error) throw result.error

      return res.status(200).json({
        success: true,
        client: result.data
      })
    }

    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memproses client.'
    })
  }
}
