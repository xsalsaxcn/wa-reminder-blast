// NOTIVA_PATCH_07_SAFE_JOTFORM_LIVE_READ_ONLY_V1
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import {
  numeric,
  requireAiReadToken,
  requireReadOnlyMethod,
  setReadOnlyHeaders
} from '../../../lib/notivaAiReadOnly'

async function getUnreadRows() {
  const pageSize = 1000
  const maxRows = 10000
  const rows = []
  let exactCount = 0

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const result = await supabaseAdmin
      .from('wa_conversations')
      .select('unread_count, last_message_at', { count: offset === 0 ? 'exact' : undefined })
      .gt('unread_count', 0)
      .order('last_message_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (result.error) throw result.error

    if (offset === 0) exactCount = numeric(result.count, 0)

    const pageRows = Array.isArray(result.data) ? result.data : []
    rows.push(...pageRows)

    if (pageRows.length < pageSize) break
  }

  return { rows, exactCount }
}

export default async function handler(req, res) {
  setReadOnlyHeaders(res)

  if (!requireReadOnlyMethod(req, res)) return
  if (!requireAiReadToken(req, res)) return

  try {
    const { rows, exactCount } = await getUnreadRows()
    const unreadMessages = rows.reduce((sum, row) => sum + Math.max(0, numeric(row.unread_count, 0)), 0)
    const latestUnreadAt = rows[0]?.last_message_at || null
    const truncated = exactCount > rows.length

    return res.status(200).json({
      success: true,
      read_only: true,
      summary: {
        unread_conversations: exactCount,
        unread_messages: unreadMessages,
        latest_unread_at: latestUnreadAt,
        unread_message_sum_truncated: truncated
      },
      generated_at: new Date().toISOString(),
      safe_answer: truncated
        ? `Ada ${exactCount} conversation belum dibaca. Total pesan unread melebihi batas ringkasan aman API.`
        : `Ada ${unreadMessages} pesan belum dibaca dari ${exactCount} conversation.`
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      read_only: true,
      message: error.message || 'Gagal membaca ringkasan Inbox.'
    })
  }
}
