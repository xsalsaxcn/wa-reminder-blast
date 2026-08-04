import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function cleanPhone(value) {
  let phone = String(value || '').trim()
  let result = ''

  if (phone.startsWith('="')) phone = phone.slice(2)
  if (phone.endsWith('"')) phone = phone.slice(0, -1)
  if (phone.startsWith("'")) phone = phone.slice(1)
  if (phone.startsWith('+')) phone = phone.slice(1)

  for (const char of phone) {
    if ('0123456789'.includes(char)) result += char
  }

  if (result.startsWith('0')) result = '62' + result.slice(1)

  return result
}

function phoneVariants(value) {
  const raw = String(value || '').trim()
  const clean = cleanPhone(raw)
  const variants = new Set()

  if (raw) variants.add(raw)
  if (clean) {
    variants.add(clean)
    variants.add('+' + clean)

    if (clean.startsWith('62')) {
      variants.add('0' + clean.slice(2))
    }
  }

  return Array.from(variants).filter(Boolean)
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    const authUser = await requireRole(req, res, ['master', 'admin', 'user', 'agent'])
    if (!authUser) return

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const rawPhone = req.body?.phone
    const phone = cleanPhone(rawPhone)

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'phone wajib diisi.'
      })
    }

    const now = new Date().toISOString()
    const variants = phoneVariants(rawPhone || phone)

    let updatedIds = []

    const directResult = await supabaseAdmin
      .from('wa_conversations')
      .update({
        unread_count: 0,
        updated_at: now
      })
      .in('phone', variants)
      .select('id, phone, unread_count')

    if (!directResult.error && Array.isArray(directResult.data)) {
      updatedIds = directResult.data.map((item) => item.id).filter(Boolean)
    }

    if (!updatedIds.length) {
      const listResult = await supabaseAdmin
        .from('wa_conversations')
        .select('id, phone, unread_count')
        .gt('unread_count', 0)
        .limit(20000)

      if (!listResult.error) {
        const ids = (listResult.data || [])
          .filter((item) => cleanPhone(item.phone) === phone)
          .map((item) => item.id)
          .filter(Boolean)

        if (ids.length) {
          const fallbackResult = await supabaseAdmin
            .from('wa_conversations')
            .update({
              unread_count: 0,
              updated_at: now
            })
            .in('id', ids)
            .select('id')

          if (!fallbackResult.error && Array.isArray(fallbackResult.data)) {
            updatedIds = fallbackResult.data.map((item) => item.id).filter(Boolean)
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      phone,
      updated_count: updatedIds.length
    })
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Unauthorized'
    })
  }
}