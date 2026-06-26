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

function isNotInterestedText(message) {
  return (
    message.includes('tidak berminat') ||
    message.includes('tidak minat') ||
    message.includes('tdk minat') ||
    message.includes('ga minat') ||
    message.includes('gak minat') ||
    message.includes('ngga minat') ||
    message.includes('nggak minat') ||
    message.includes('tidak tertarik') ||
    message.includes('belum minat') ||
    message.includes('maaf tidak') ||
    message.includes('tidak jadi') ||
    message.includes('ga jadi') ||
    message.includes('gak jadi') ||
    message.includes('batal') ||
    message.includes('cancel')
  )
}

function isOptOutText(message) {
  return (
    message.includes('stop') ||
    message.includes('unsubscribe') ||
    message.includes('jangan kirim') ||
    message.includes('jangan chat') ||
    message.includes('jangan wa') ||
    message.includes('hapus nomor') ||
    message.includes('remove')
  )
}

function isComplaintText(message) {
  return (
    message.includes('komplain') ||
    message.includes('complain') ||
    message.includes('kecewa') ||
    message.includes('marah') ||
    message.includes('tidak puas')
  )
}

function isFollowUpText(message) {
  return (
    message.includes('harga') ||
    message.includes('biaya') ||
    message.includes('berapa') ||
    message.includes('info') ||
    message.includes('minta info') ||
    message.includes('detail') ||
    message.includes('jadwal') ||
    message.includes('schedule') ||
    message.includes('nanti') ||
    message.includes('lihat dulu') ||
    message.includes('liat dulu') ||
    message.includes('tanya') ||
    message.includes('apa ada') ||
    message.includes('apakah ada') ||
    message.includes('kapan') ||
    message.includes('dimana') ||
    message.includes('di mana') ||
    message.includes('online') ||
    message.includes('offline') ||
    message.includes('seminar yg lain') ||
    message.includes('seminar yang lain') ||
    message.includes('?')
  )
}

function isInterestedText(message) {
  return (
    message.includes('berminat') ||
    message.includes('saya minat') ||
    message.includes('aku minat') ||
    message.includes('mau daftar') ||
    message.includes('ingin daftar') ||
    message.includes('daftar') ||
    message.includes('booking') ||
    message.includes('ikut') ||
    message.includes('mau ikut') ||
    message.includes('boleh daftar') ||
    message.includes('lanjut') ||
    message === 'ya' ||
    message === 'iya' ||
    message === 'ok' ||
    message === 'oke' ||
    message === 'yes'
  )
}

function normalizeLabel(value, body) {
  const label = cleanText(value)
  const lower = label.toLowerCase()
  const message = cleanText(body).toLowerCase()

  if (
    lower.includes('opt') ||
    lower.includes('unsubscribe') ||
    isOptOutText(message)
  ) {
    return 'Opt-out'
  }

  if (
    lower.includes('komplain') ||
    lower.includes('complain') ||
    isComplaintText(message)
  ) {
    return 'Komplain'
  }

  if (
    lower.includes('tidak') ||
    lower.includes('not') ||
    lower.includes('negative') ||
    lower.includes('negatif') ||
    isNotInterestedText(message)
  ) {
    return 'Tidak berminat'
  }

  if (
    lower.includes('follow') ||
    lower.includes('tanya') ||
    isFollowUpText(message)
  ) {
    return 'Follow-up'
  }

  if (
    lower.includes('berminat') ||
    lower.includes('interested') ||
    lower.includes('positive') ||
    lower.includes('positif') ||
    isInterestedText(message)
  ) {
    return 'Berminat'
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
  const intent = normalizeIntent(label)
  const score = scoreFromLabel(label)

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
    score,
    source_job_id: row.source_job_id || row.job_id || null,
    job_id: row.job_id || row.source_job_id || null,
    received_at: row.received_at || row.message_created_at || row.created_at || row.updated_at || null
  }
}

function matchLabel(rowLabel, filterLabel) {
  const current = cleanText(rowLabel).toLowerCase()
  const target = cleanText(filterLabel).toLowerCase()

  if (!target || target === 'all' || target === 'semua') return true

  if (target === 'tidak berminat' || target === 'tidak minat') {
    return current === 'tidak berminat' || current === 'tidak minat'
  }

  if (target === 'follow up') {
    return current === 'follow-up' || current === 'follow up'
  }

  return current === target
}

function uniqueKey(row, jobIdFilter) {
  const phone = cleanPhone(row.phone)

  if (!phone) return row.id || Math.random().toString()

  if (jobIdFilter) {
    return `${cleanText(row.job_id || row.source_job_id)}:${phone}`
  }

  return phone
}

function makeUniqueFinalRows(rows, jobIdFilter) {
  const sorted = [...rows].sort((a, b) => getDateValue(b.received_at) - getDateValue(a.received_at))
  const map = new Map()

  for (const row of sorted) {
    const key = uniqueKey(row, jobIdFilter)

    if (!map.has(key)) {
      map.set(key, {
        ...row,
        analysis_count: 1,
        latest_message: row.body,
        latest_label: row.label,
        latest_intent: row.intent,
        latest_score: row.score,
        history: [row]
      })
    } else {
      const existing = map.get(key)
      existing.analysis_count += 1
      existing.history.push(row)
    }
  }

  return Array.from(map.values()).sort((a, b) => getDateValue(b.received_at) - getDateValue(a.received_at))
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

    let rows = rawRows.map(normalizeRow).filter((row) => row.phone)

    if (start) {
      const startTime = getDateValue(start)
      rows = rows.filter((row) => getDateValue(row.received_at) >= startTime)
    }

    if (end) {
      const endTime = getDateValue(end) + 24 * 60 * 60 * 1000
      rows = rows.filter((row) => getDateValue(row.received_at) <= endTime)
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

    const uniqueRowsBeforeLabelFilter = makeUniqueFinalRows(rows, job_id)

    const summary = uniqueRowsBeforeLabelFilter.reduce(
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

    let uniqueRows = uniqueRowsBeforeLabelFilter

    if (label && label !== 'all') {
      uniqueRows = uniqueRows.filter((row) => matchLabel(row.label, label))
    }

    return res.status(200).json({
      success: true,
      rows: uniqueRows,
      items: uniqueRows,
      data: uniqueRows,
      summary,
      debug: {
        raw_rows_loaded: rawRows.length,
        rows_after_base_filter: rows.length,
        unique_contacts: uniqueRowsBeforeLabelFilter.length,
        rows_after_label_filter: uniqueRows.length,
        unique_mode: true
      }
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal memuat reply analysis.'
    })
  }
}