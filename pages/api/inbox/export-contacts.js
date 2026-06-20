import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'
import { cleanPhone, getBlacklistPhones } from '../../../lib/blacklist'

function csvEscape(value) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function cleanName(name, phone) {
  const value = String(name || '').trim()

  if (!value || value === '.' || value === '-' || value.toLowerCase() === 'unknown') {
    return phone
  }

  return value
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    await requireRole(req, res, ['master', 'admin', 'user', 'agent'])

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const mode = String(req.query.mode || '24h')
    const hours = Number(req.query.hours || 24)

    const defaultMessage =
      'Halo Kak, ini informasi dari inHarmony Clinic. Terima kasih.'

    const blacklistPhones = await getBlacklistPhones()

    const { data, error } = await supabaseAdmin
      .from('wa_incoming_messages')
      .select('phone, profile_name, body, received_at')
      .not('phone', 'is', null)
      .order('received_at', { ascending: false })
      .limit(5000)

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      })
    }

    const now = Date.now()
    const windowMs = hours * 60 * 60 * 1000
    const contactsMap = new Map()

    for (const item of data || []) {
      const phone = cleanPhone(item.phone)

      if (!phone) continue
      if (blacklistPhones.has(phone)) continue
      if (contactsMap.has(phone)) continue

      const receivedAt = item.received_at ? new Date(item.received_at).getTime() : 0
      const isWithinWindow = receivedAt && now - receivedAt <= windowMs

      if (mode === '24h' && !isWithinWindow) {
        continue
      }

      contactsMap.set(phone, {
        name: cleanName(item.profile_name, phone),
        phone,
        message: defaultMessage
      })
    }

    const rows = Array.from(contactsMap.values())

    const csvLines = [
      ['name', 'phone', 'message'].map(csvEscape).join(','),
      ...rows.map((row) =>
        [row.name, row.phone, row.message].map(csvEscape).join(',')
      )
    ]

    const csv = '\ufeff' + csvLines.join('\n')
    const filename =
      mode === 'all'
        ? 'inbox_contacts_all_exclude_blacklist.csv'
        : `inbox_contacts_${hours}h_exclude_blacklist.csv`

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    return res.status(200).send(csv)
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Unauthorized'
    })
  }
}