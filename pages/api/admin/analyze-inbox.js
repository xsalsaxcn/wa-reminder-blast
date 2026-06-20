import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'
import { analyzeLeadMessage } from '../../../lib/leadAnalyzer'
import { upsertBlacklist } from '../../../lib/blacklist'

async function findSourceJob(phone, receivedAt) {
  const { data: items } = await supabaseAdmin
    .from('send_job_items')
    .select('job_id, processed_at, status')
    .eq('phone', phone)
    .eq('status', 'sent')
    .lte('processed_at', receivedAt)
    .order('processed_at', { ascending: false })
    .limit(1)

  const item = items?.[0]

  if (!item?.job_id) {
    return {
      source_job_id: null,
      source_job_type: null
    }
  }

  const { data: job } = await supabaseAdmin
    .from('send_jobs')
    .select('id, type')
    .eq('id', item.job_id)
    .single()

  return {
    source_job_id: item.job_id,
    source_job_type: job?.type || null
  }
}

async function updateContactScore(phone) {
  const { data: rows, error } = await supabaseAdmin
    .from('wa_message_analysis')
    .select('*')
    .eq('phone', phone)
    .order('received_at', { ascending: false })
    .limit(200)

  if (error || !rows || rows.length === 0) return

  const latest = rows[0]

  const interestedCount = rows.filter((row) => row.label === 'Berminat').length
  const notInterestedCount = rows.filter((row) => row.label === 'Tidak berminat').length
  const neutralCount = rows.filter(
    (row) => row.label === 'Netral' || row.label === 'Follow-up'
  ).length
  const optOut = rows.some((row) => row.label === 'Opt-out')
  const complaintCount = rows.filter((row) => row.label === 'Komplain').length

  const avgScore = Math.round(
    rows.reduce((sum, row) => sum + Number(row.score || 0), 0) / rows.length
  )

  let status = 'neutral'

  if (optOut) {
    status = 'opt_out'
  } else if (complaintCount > 0) {
    status = 'complaint'
  } else if (avgScore >= 80 || interestedCount >= 2) {
    status = 'hot'
  } else if (avgScore >= 55 || interestedCount >= 1) {
    status = 'warm'
  } else if (notInterestedCount > interestedCount) {
    status = 'cold'
  }

  await supabaseAdmin
    .from('wa_contact_scores')
    .upsert(
      {
        phone,
        profile_name: latest.profile_name,
        latest_label: latest.label,
        latest_intent: latest.intent,
        lead_score: optOut ? 0 : avgScore,
        status,
        last_message: latest.body,
        last_message_at: latest.received_at,
        total_messages: rows.length,
        interested_count: interestedCount,
        not_interested_count: notInterestedCount,
        neutral_count: neutralCount,
        opt_out: optOut,
        source_job_id: latest.source_job_id,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: 'phone'
      }
    )
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    await requireRole(req, res, ['master', 'admin', 'user', 'agent'])

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const limit = Number(req.query.limit || req.body?.limit || 500)

    const { data: messages, error } = await supabaseAdmin
      .from('wa_incoming_messages')
      .select('*')
      .not('phone', 'is', null)
      .order('received_at', { ascending: false })
      .limit(limit)

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      })
    }

    let analyzed = 0
    let autoBlacklisted = 0
    let failed = 0
    const errors = []

    for (const msg of messages || []) {
      try {
        const result = analyzeLeadMessage(msg.body || '')
        const source = await findSourceJob(msg.phone, msg.received_at)

        const { error: upsertError } = await supabaseAdmin
          .from('wa_message_analysis')
          .upsert(
            {
              incoming_message_id: msg.id,
              phone: msg.phone,
              profile_name: msg.profile_name,
              body: msg.body || '',
              received_at: msg.received_at,
              label: result.label,
              intent: result.intent,
              score: result.score,
              confidence: result.confidence,
              reasons: result.reasons,
              source_job_id: source.source_job_id,
              source_job_type: source.source_job_type,
              updated_at: new Date().toISOString()
            },
            {
              onConflict: 'incoming_message_id'
            }
          )

        if (upsertError) {
          failed += 1
          errors.push(upsertError.message)
          continue
        }

        analyzed += 1

        await updateContactScore(msg.phone)

        if (result.label === 'Opt-out') {
          await upsertBlacklist({
            phone: msg.phone,
            profile_name: msg.profile_name,
            reason: msg.body || 'Detected opt-out from incoming message',
            source: 'auto_analysis',
            created_by: 'system'
          })

          autoBlacklisted += 1
        }
      } catch (itemError) {
        failed += 1
        errors.push(itemError.message || 'Failed to analyze message')
      }
    }

    return res.status(200).json({
      success: true,
      analyzed,
      autoBlacklisted,
      failed,
      total: messages?.length || 0,
      errors: errors.slice(0, 10)
    })
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Unauthorized'
    })
  }
}