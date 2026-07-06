import { createHash } from 'crypto'
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

function makeHash(value) {
  return createHash('sha1').update(String(value || '')).digest('hex')
}

function getValue(row, keys) {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return row[key]
    }
  }

  return ''
}

function safeJsonParse(value) {
  if (!value) return null
  if (typeof value === 'object') return value

  try {
    return JSON.parse(String(value))
  } catch (err) {
    return null
  }
}

function findDeepText(payload) {
  if (!payload || typeof payload !== 'object') return ''

  const values = [
    payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body,
    payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.button?.text,
    payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.interactive?.button_reply?.title,
    payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.interactive?.list_reply?.title,
    payload?.messages?.[0]?.text?.body,
    payload?.messages?.[0]?.button?.text,
    payload?.messages?.[0]?.interactive?.button_reply?.title,
    payload?.messages?.[0]?.interactive?.list_reply?.title,
    payload?.text?.body,
    payload?.button?.text,
    payload?.body,
    payload?.message,
    payload?.text
  ]

  for (const value of values) {
    const text = cleanText(value)
    if (text) return text
  }

  return ''
}

function findDeepPhone(payload) {
  if (!payload || typeof payload !== 'object') return ''

  const values = [
    payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from,
    payload?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id,
    payload?.messages?.[0]?.from,
    payload?.contacts?.[0]?.wa_id,
    payload?.from,
    payload?.wa_id,
    payload?.phone
  ]

  for (const value of values) {
    const phone = cleanPhone(value)
    if (phone) return phone
  }

  return ''
}

function findDeepName(payload) {
  if (!payload || typeof payload !== 'object') return ''

  const values = [
    payload?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name,
    payload?.contacts?.[0]?.profile?.name,
    payload?.profile?.name,
    payload?.profile_name,
    payload?.name
  ]

  for (const value of values) {
    const text = cleanText(value)
    if (text) return text
  }

  return ''
}

function classifyReply(body) {
  const text = cleanText(body).toLowerCase()

  if (
    text.includes('stop') ||
    text.includes('unsubscribe') ||
    text.includes('jangan kirim') ||
    text.includes('jangan chat') ||
    text.includes('jangan wa') ||
    text.includes('hapus nomor') ||
    text.includes('remove')
  ) {
    return {
      label: 'Opt-out',
      intent: 'opt_out',
      score: 0
    }
  }

  if (
    text.includes('komplain') ||
    text.includes('complain') ||
    text.includes('kecewa') ||
    text.includes('marah') ||
    text.includes('tidak puas')
  ) {
    return {
      label: 'Komplain',
      intent: 'complaint',
      score: 20
    }
  }

  if (
    text.includes('tidak berminat') ||
    text.includes('tidak minat') ||
    text.includes('tdk minat') ||
    text.includes('ga minat') ||
    text.includes('gak minat') ||
    text.includes('ngga minat') ||
    text.includes('nggak minat') ||
    text.includes('tidak tertarik') ||
    text.includes('belum minat') ||
    text.includes('maaf tidak') ||
    text.includes('tidak jadi') ||
    text.includes('ga jadi') ||
    text.includes('gak jadi') ||
    text.includes('batal') ||
    text.includes('cancel')
  ) {
    return {
      label: 'Tidak berminat',
      intent: 'not_interested',
      score: 0
    }
  }

  if (
    text.includes('mau daftar') ||
    text.includes('ingin daftar') ||
    text.includes('boleh daftar') ||
    text.includes('daftarkan') ||
    text.includes('booking') ||
    text.includes('register') ||
    text.includes('registrasi') ||
    text.includes('bayar') ||
    text.includes('payment') ||
    text.includes('transfer') ||
    text.includes('invoice')
  ) {
    return {
      label: 'Berminat',
      intent: 'interested',
      score: 100
    }
  }

  if (
    text.includes('harga') ||
    text.includes('biaya') ||
    text.includes('berapa') ||
    text.includes('info') ||
    text.includes('detail') ||
    text.includes('jadwal') ||
    text.includes('schedule') ||
    text.includes('nanti') ||
    text.includes('lihat dulu') ||
    text.includes('liat dulu') ||
    text.includes('tanya') ||
    text.includes('apa ada') ||
    text.includes('apakah ada') ||
    text.includes('kapan') ||
    text.includes('dimana') ||
    text.includes('di mana') ||
    text.includes('online') ||
    text.includes('offline') ||
    text.includes('?')
  ) {
    return {
      label: 'Follow-up',
      intent: 'follow_up',
      score: 70
    }
  }

  if (
    text.includes('berminat') ||
    text.includes('minat') ||
    text.includes('tertarik') ||
    text.includes('mau') ||
    text.includes('boleh') ||
    text.includes('daftar') ||
    text.includes('ikut') ||
    text === 'ya' ||
    text === 'iya' ||
    text === 'ok' ||
    text === 'oke' ||
    text === 'yes'
  ) {
    return {
      label: 'Berminat',
      intent: 'interested',
      score: 100
    }
  }

  return {
    label: 'Netral',
    intent: 'neutral',
    score: 40
  }
}

function normalizeIncoming(row) {
  const payload =
    safeJsonParse(row.payload) ||
    safeJsonParse(row.raw_payload) ||
    safeJsonParse(row.webhook_payload) ||
    safeJsonParse(row.message_payload) ||
    safeJsonParse(row.data) ||
    safeJsonParse(row.raw) ||
    null

  const rawId = cleanText(
    getValue(row, [
      'id',
      'message_id',
      'whatsapp_message_id',
      'wa_message_id',
      'meta_message_id'
    ])
  )

  const phone =
    cleanPhone(
      getValue(row, [
        'phone',
        'from',
        'wa_id',
        'wa_phone',
        'sender_phone',
        'customer_phone',
        'contact_phone',
        'from_phone'
      ])
    ) || findDeepPhone(payload)

  const profileName =
    cleanText(
      getValue(row, [
        'profile_name',
        'name',
        'sender_name',
        'contact_name',
        'customer_name'
      ])
    ) || findDeepName(payload)

  const body =
    cleanText(
      getValue(row, [
        'body',
        'message',
        'text',
        'content',
        'caption',
        'media_caption',
        'message_text',
        'text_body',
        'message_body'
      ])
    ) || findDeepText(payload)

  const receivedAt =
    getValue(row, [
      'received_at',
      'timestamp',
      'message_created_at',
      'created_at',
      'created_time',
      'date'
    ]) || new Date().toISOString()

  const direction = cleanText(
    getValue(row, [
      'direction',
      'message_direction',
      'type'
    ])
  ).toLowerCase()

  const stableId = rawId || `incoming_${makeHash(`${phone}|${receivedAt}|${body}`)}`

  return {
    id: stableId,
    phone,
    profile_name: profileName,
    body,
    received_at: receivedAt,
    direction
  }
}

function isIncoming(row) {
  if (!row.phone || !row.body) return false
  if (!row.direction) return true
  if (row.direction.includes('out')) return false
  if (row.direction.includes('sent')) return false
  return true
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    const authUser = await requireRole(req, res, ['master', 'admin', 'user', 'agent'])
    if (!authUser) return

    if (req.method !== 'POST' && req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const incomingResult = await supabaseAdmin
      .from('wa_incoming_messages')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(5000)

    if (incomingResult.error) {
      return res.status(500).json({
        success: false,
        message: incomingResult.error.message
      })
    }

    const incomingRows = Array.isArray(incomingResult.data) ? incomingResult.data : []
    const messages = incomingRows.map(normalizeIncoming).filter(isIncoming)

    let analyzed = 0
    let interested = 0
    let followUp = 0
    let notInterested = 0
    let neutral = 0
    let optOut = 0
    let complaint = 0
    const errors = []

    for (const message of messages) {
      const classification = classifyReply(message.body)

      if (classification.label === 'Berminat') interested += 1
      else if (classification.label === 'Follow-up') followUp += 1
      else if (classification.label === 'Tidak berminat') notInterested += 1
      else if (classification.label === 'Opt-out') optOut += 1
      else if (classification.label === 'Komplain') complaint += 1
      else neutral += 1

      const insertPayload = {
        incoming_message_id: message.id,
        phone: message.phone,
        profile_name: message.profile_name || null,
        body: message.body,
        received_at: message.received_at,
        label: classification.label,
        intent: classification.intent,
        score: classification.score
      }

      const deleteResult = await supabaseAdmin
        .from('wa_message_analysis')
        .delete()
        .eq('incoming_message_id', message.id)

      if (deleteResult.error) {
        errors.push({
          phase: 'delete',
          phone: message.phone,
          body: message.body,
          error: deleteResult.error.message
        })
        continue
      }

      const insertResult = await supabaseAdmin
        .from('wa_message_analysis')
        .insert(insertPayload)

      if (insertResult.error) {
        errors.push({
          phase: 'insert',
          phone: message.phone,
          body: message.body,
          error: insertResult.error.message
        })
      } else {
        analyzed += 1
      }
    }

    return res.status(200).json({
      success: true,
      source_table: 'wa_incoming_messages',
      total_incoming: incomingRows.length,
      normalized_messages: messages.length,
      analyzed,
      interested,
      follow_up: followUp,
      not_interested: notInterested,
      opt_out: optOut,
      complaint,
      neutral,
      errors: errors.slice(0, 20),
      error_count: errors.length
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Analyze inbox gagal.'
    })
  }
}