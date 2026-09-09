// NOTIVA_PATCH_05_SAFE_FAST_INBOX_QUICK_LIST_V1
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

const FREE_TEXT_WINDOW_MS = 24 * 60 * 60 * 1000

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

function buildWindowInfo(lastIncomingAt) {
  const time = getTime(lastIncomingAt)

  if (!time) {
    return {
      has_customer_inbound: false,
      can_send_free_text: false,
      is_expired_24h: true,
      hours_since_last_incoming: null,
      window_status: 'no_inbound',
      window_note: 'Belum ada pesan masuk dari customer. Gunakan template untuk memulai chat.'
    }
  }

  const expired = Date.now() - time > FREE_TEXT_WINDOW_MS
  const hours = Math.max(0, Math.floor((Date.now() - time) / (60 * 60 * 1000)))

  return {
    has_customer_inbound: true,
    can_send_free_text: !expired,
    is_expired_24h: expired,
    hours_since_last_incoming: hours,
    window_status: expired ? 'expired' : 'open',
    window_note: expired
      ? 'Expired >24 jam. Free text berisiko gagal, gunakan template untuk follow-up.'
      : 'Masih dalam window 24 jam. Free text masih bisa digunakan.'
  }
}

function mapConversation(conv) {
  const phone = cleanPhone(conv?.phone)
  const lastMessageAt = conv?.last_message_at || conv?.updated_at || conv?.created_at || null
  const campaignType = cleanText(conv?.campaign_type)
  const projectName = cleanText(conv?.project_name)
  const batchName = cleanText(conv?.batch_name)
  const campaignLabel = cleanText(conv?.campaign_label)

  return {
    ...conv,
    id: conv?.id || phone,
    phone,
    profile_name: cleanText(conv?.profile_name) || phone,
    last_message: conv?.last_message || '',
    last_message_at: lastMessageAt,
    unread_count: Math.max(0, toNumber(conv?.unread_count, 0)),
    status: conv?.status || 'open',
    campaign_type: campaignType,
    project_name: projectName,
    batch_name: batchName,
    campaign_label: campaignLabel,
    ...buildWindowInfo(conv?.last_incoming_at)
  }
}

function getLimit(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return 50
  return Math.min(100, Math.max(20, Math.floor(number)))
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')

  try {
    await requireRole(req, res, ['master', 'admin', 'user', 'agent'])

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const limit = getLimit(req.query.limit)
    const focusPhone = cleanPhone(req.query.focus_phone)

    const result = await supabaseAdmin
      .from('wa_conversations')
      .select('*', { count: 'exact' })
      .order('last_message_at', { ascending: false })
      .range(0, limit - 1)

    if (result.error) {
      return res.status(500).json({
        success: false,
        message: result.error.message
      })
    }

    const mapped = (result.data || [])
      .map(mapConversation)
      .filter((item) => item.phone)

    if (focusPhone && !mapped.some((item) => item.phone === focusPhone)) {
      const focusResult = await supabaseAdmin
        .from('wa_conversations')
        .select('*')
        .in('phone', [focusPhone, '+' + focusPhone])
        .limit(1)

      if (!focusResult.error && focusResult.data?.[0]) {
        const focused = mapConversation(focusResult.data[0])
        if (focused.phone) mapped.unshift(focused)
      }
    }

    const unique = new Map()

    for (const item of mapped) {
      if (!item?.phone || unique.has(item.phone)) continue
      unique.set(item.phone, item)
    }

    const conversations = Array.from(unique.values()).slice(0, limit)
    const total = Math.max(Number(result.count || 0), conversations.length)

    return res.status(200).json({
      success: true,
      fast: true,
      conversations,
      page: {
        limit,
        offset: 0,
        total,
        filtered_total: total,
        returned: conversations.length,
        has_more: total > conversations.length,
        next_offset: total > conversations.length ? conversations.length : null
      },
      filters: {
        campaign_types: [],
        projects: []
      }
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memuat inbox cepat'
    })
  }
}
