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

  for (const char of phone) {
    if ('0123456789'.includes(char)) result += char
  }

  if (result.startsWith('0')) result = '62' + result.slice(1)

  return result
}

function getDateValue(value) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return 0
  return date.getTime()
}

function normalizeLabel(value, body) {
  const label = cleanText(value)
  const lower = label.toLowerCase()
  const message = cleanText(body).toLowerCase()

  if (
    lower.includes('berminat') ||
    lower.includes('interested') ||
    lower.includes('positive') ||
    lower.includes('positif') ||
    message.includes('mau vaksin') ||
    message.includes('vaksin') ||
    message.includes('berminat') ||
    message.includes('minat') ||
    message.includes('mau') ||
    message.includes('boleh') ||
    message.includes('daftar') ||
    message.includes('booking') ||
    message.includes('jadwal') ||
    message.includes('ikut')
  ) {
    return 'Berminat'
  }

  if (
    lower.includes('tidak') ||
    lower.includes('not') ||
    lower.includes('negative') ||
    lower.includes('negatif') ||
    message.includes('tidak berminat') ||
    message.includes('tidak minat') ||
    message.includes('ga minat') ||
    message.includes('gak minat') ||
    message.includes('nggak minat') ||
    message.includes('stop') ||
    message.includes('jangan kirim')
  ) {
    return 'Tidak berminat'
  }

  if (
    lower.includes('follow') ||
    lower.includes('tanya') ||
    message.includes('harga') ||
    message.includes('biaya') ||
    message.includes('berapa') ||
    message.includes('info') ||
    message.includes('nanti')
  ) {
    return 'Follow-up'
  }

  if (
    lower.includes('opt') ||
    lower.includes('unsubscribe') ||
    message.includes('unsubscribe')
  ) {
    return 'Opt-out'
  }

  if (
    lower.includes('komplain') ||
    lower.includes('complain') ||
    message.includes('komplain') ||
    message.includes('kecewa')
  ) {
    return 'Komplain'
  }

  return 'Netral'
}

function normalizeIntent(label) {
  const lower = cleanText(label).toLowerCase()

  if (lower.includes('berminat')) return 'interested'
  if (lower.includes('tidak')) return 'not_interested'
  if (lower.includes('follow')) return 'follow_up'
  if (lower.includes('opt')) return 'opt_out'
  if (lower.includes('komplain')) return 'complaint'

  return 'neutral'
}

function scoreFromLabel(label) {
  const intent = normalizeIntent(label)

  if (intent === 'interested') return 100
  if (intent === 'follow_up') return 70
  if (intent === 'neutral') return 40
  if (intent === 'complaint') return 20
  if (intent === 'not_interested') return 0
  if (intent === 'opt_out') return 0

  return 40
}

function normalizeRow(row) {
  const body = cleanText(row.body || row.message || row.text || row.content || '')
  const rawLabel = cleanText(row.label || row.category || row.intent || row.sentiment || '')
  const label = normalizeLabel(rawLabel, body)
  const intent = cleanText(row.intent) || normalizeIntent(label)
  const score = row.score !== undefined && row.score !== null ? Number(row.score) : scoreFromLabel(label)

  return {
    id: row.id,
    incoming_message_id: row.incoming_message_id || row.source_message_id || row.message_id || null,
    phone: cleanPhone(row.phone || row.wa_id || row.sender_phone || row.customer_phone || ''),
    profile_name: cleanText(row.profile_name || row.name || row.sender_name || row.contact_name || '-'),
    body,
    message: body,
    label,
    raw_label: rawLabel,
    intent,
    score: Number.isFinite(score) ? score : scoreFromLabel(label),
    source_job_id: row.source_job_id || row.job_id || null,
    job_id: row.job_id || row.source_job_id || null,
    received_at: row.received_at || row.message_created_at || row.created_at || row.updated_at || null
  }
}

function matchLabel(rowLabel, filterLabel) {
  const current = cleanText(rowLabel).toLowerCase()
  const target = cleanText(filterLabel).toLowerCase()

  if (!target || target === 'all' || target === 'semua') return true

  if (target === 'tidak berminat') {
    return current === 'tidak berminat' || current === 'tidak minat'
  }

  if (target === 'follow up') {
    return current === 'follow-up' || current === 'follow up'
  }

  return current === target
}

async function fetchAllAnalysisRows() {
  const pageSize = 1000
  let from = 0
  let allRows = []

  while (true) {
    const to = from + pageSize - 1

    const result = await supabaseAdmin
      .from('wa_message_analysis')
      .select('*')
      .range(from, to)

    if (result.error) {
      throw new Error(result.error.message)
    }

    const batch = Array.isArray(result.data) ? result.data : []
    allRows = allRows.concat(batch)

    if (batch.length < pageSize) break

    from += pageSize

    if (from > 50000) break
  }

  return allRows
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    const authUser = await requireRole(req, res, ['master', 'admin', 'user', 'agent'])
    if (!authUser) return

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const {
      start = '',
      end = '',
      label = 'all',
      job_id = '',
      search = ''
    } = req.query || {}

    const rawRows = await fetchAllAnalysisRows()

    let rows = rawRows.map(normalizeRow)

    if (start) {
      const startTime = getDateValue(start)
      rows = rows.filter((row) => getDateValue(row.received_at) >= startTime)
    }

    if (end) {
      const endTime = getDateValue(end) + 24 * 60 * 60 * 1000
      rows = rows.filter((row) => getDateValue(row.received_at) <= endTime)
    }

    if (label && label !== 'all') {
      rows = rows.filter((row) => matchLabel(row.label, label))
    }

    if (job_id) {
      rows = rows.filter((row) => cleanText(row.job_id) === cleanText(job_id))
    }

    if (search) {
      const q = cleanText(search).toLowerCase()

      rows = rows.filter((row) => {
        return (
          cleanText(row.phone).toLowerCase().includes(q) ||
          cleanText(row.profile_name).toLowerCase().includes(q) ||
          cleanText(row.body).toLowerCase().includes(q) ||
          cleanText(row.label).toLowerCase().includes(q)
        )
      })
    }

    rows.sort((a, b) => getDateValue(b.received_at) - getDateValue(a.received_at))

    const summary = rows.reduce(
      (acc, row) => {
        acc.total += 1

        const labelText = cleanText(row.label).toLowerCase()

        if (labelText === 'berminat') acc.interested += 1
        else if (labelText === 'tidak berminat') acc.notInterested += 1
        else if (labelText === 'follow-up' || labelText === 'follow up') acc.followUp += 1
        else if (labelText === 'opt-out') acc.optOut += 1
        else acc.neutral += 1

        acc.totalScore += Number(row.score || 0)

        return acc
      },
      {
        total: 0,
        interested: 0,
        notInterested: 0,
        followUp: 0,
        neutral: 0,
        optOut: 0,
        totalScore: 0
      }
    )

    summary.avgScore = summary.total > 0 ? Math.round(summary.totalScore / summary.total) : 0
    delete summary.totalScore

    return res.status(200).json({
      success: true,
      rows,
      items: rows,
      data: rows,
      summary,
      debug: {
        raw_rows_loaded: rawRows.length,
        rows_after_filter: rows.length
      }
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memuat reply analysis.'
    })
  }
}