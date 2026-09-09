// NOTIVA_PATCH_07_SAFE_JOTFORM_LIVE_READ_ONLY_V1
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import {
  FAILED_STATUSES,
  jakartaDayRange,
  maskPhone,
  readInput,
  requireAiReadToken,
  requireReadOnlyMethod,
  setReadOnlyHeaders
} from '../../../lib/notivaAiReadOnly'

async function countLogs(range, statuses = null) {
  let query = supabaseAdmin
    .from('reminder_logs')
    .select('id', { count: 'exact', head: true })
    .gte('sent_at', range.start)
    .lt('sent_at', range.end_exclusive)

  if (statuses?.length) query = query.in('status', statuses)

  const result = await query
  if (result.error) throw result.error
  return Number(result.count || 0)
}

export default async function handler(req, res) {
  setReadOnlyHeaders(res)

  if (!requireReadOnlyMethod(req, res)) return
  if (!requireAiReadToken(req, res)) return

  try {
    const range = jakartaDayRange(readInput(req, ['date', 'tanggal']))

    const [total, sent, failed, failureRows] = await Promise.all([
      countLogs(range),
      countLogs(range, ['sent', 'success', 'delivered', 'read', 'done', 'completed']),
      countLogs(range, FAILED_STATUSES),
      supabaseAdmin
        .from('reminder_logs')
        .select('phone, status, error_message, sent_at')
        .gte('sent_at', range.start)
        .lt('sent_at', range.end_exclusive)
        .in('status', FAILED_STATUSES)
        .order('sent_at', { ascending: false })
        .limit(5)
    ])

    if (failureRows.error) throw failureRows.error

    const others = Math.max(0, total - sent - failed)
    const failures = (failureRows.data || []).map((row) => ({
      phone_masked: maskPhone(row.phone),
      status: row.status || 'failed',
      reason: row.error_message || 'Tidak ada detail error',
      at: row.sent_at || null
    }))

    return res.status(200).json({
      success: true,
      read_only: true,
      date: range.date,
      timezone: range.timezone,
      summary: {
        total_attempts: total,
        sent_or_success: sent,
        failed,
        other_status: others
      },
      recent_failure_examples: failures,
      generated_at: new Date().toISOString(),
      safe_answer: `Reminder ${range.date}: ${total} percobaan, ${sent} berhasil/terkirim, ${failed} gagal${others ? `, ${others} status lain` : ''}.`
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      read_only: true,
      message: error.message || 'Gagal membaca ringkasan reminder.'
    })
  }
}
