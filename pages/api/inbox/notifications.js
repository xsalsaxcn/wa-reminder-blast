// NOTIVA_PATCH_01_SAFE_NOTIFICATION_QUERY_V1
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function cleanText(value) {
  return String(value || '').trim()
}

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

function toNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function getTime(value) {
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

async function fetchUnreadConversations() {
  const pageSize = 1000
  const rows = []

  for (let from = 0; from < 100000; from += pageSize) {
    const to = from + pageSize - 1

    const result = await supabaseAdmin
      .from('wa_conversations')
      .select('id, phone, profile_name, last_message, last_message_at, unread_count, status, created_at, updated_at')
      .gt('unread_count', 0)
      .order('last_message_at', { ascending: false })
      .range(from, to)

    if (result.error) throw result.error

    const pageRows = Array.isArray(result.data) ? result.data : []
    rows.push(...pageRows)

    if (pageRows.length < pageSize) break
  }

  return rows
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  res.setHeader('X-Notiva-Optimization', 'safe-notification-query-v1')

  try {
    const authUser = await requireRole(req, res, ['master', 'admin', 'user', 'agent'])
    if (!authUser) return

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const rows = await fetchUnreadConversations()
    const merged = new Map()

    for (const row of rows) {
      const phone = cleanPhone(row.phone)
      if (!phone) continue

      const next = {
        id: row.id || phone,
        phone,
        profile_name: cleanText(row.profile_name) || phone,
        last_message: row.last_message || '',
        last_message_at: row.last_message_at || row.updated_at || row.created_at || null,
        unread_count: Math.max(0, toNumber(row.unread_count, 0)),
        status: row.status || 'open',
        created_at: row.created_at || null,
        updated_at: row.updated_at || null
      }

      const existing = merged.get(phone)
      if (!existing || getTime(next.last_message_at) >= getTime(existing.last_message_at)) {
        merged.set(phone, next)
      }
    }

    const conversations = Array.from(merged.values())
      .filter((item) => item.unread_count > 0)
      .sort((a, b) => getTime(b.last_message_at) - getTime(a.last_message_at))

    return res.status(200).json({
      success: true,
      conversations,
      unread_total: conversations.reduce((sum, item) => sum + item.unread_count, 0)
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memuat inbox notification'
    })
  }
}
