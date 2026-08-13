import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'
import { sendWhatsAppText } from '../../../lib/metaWhatsapp'

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

function phoneVariants(value) {
  const raw = cleanText(value)
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

function normalize(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function uniqueWords(value) {
  return Array.from(
    new Set(
      normalize(value)
        .split(' ')
        .map(cleanText)
        .filter((word) => word.length >= 3)
    )
  )
}

function includesAny(text, keywords) {
  const normalizedText = normalize(text)

  for (const keyword of keywords || []) {
    const normalizedKeyword = normalize(keyword)
    if (!normalizedKeyword) continue
    if (normalizedText.includes(normalizedKeyword)) return true
  }

  return false
}

function scoreFaq(message, faq) {
  const messageNorm = normalize(message)
  const questionNorm = normalize(faq.question)
  const answerNorm = normalize(faq.answer)
  const keywords = Array.isArray(faq.keywords) ? faq.keywords : []

  let score = 0

  for (const keyword of keywords) {
    const keywordNorm = normalize(keyword)
    if (!keywordNorm) continue

    if (messageNorm.includes(keywordNorm)) {
      score += 35
    }
  }

  const messageWords = uniqueWords(messageNorm)
  const questionWords = uniqueWords(questionNorm)
  const answerWords = uniqueWords(answerNorm)

  for (const word of messageWords) {
    if (questionWords.includes(word)) score += 8
    if (answerWords.includes(word)) score += 3
  }

  if (questionNorm && messageNorm.includes(questionNorm)) score += 50

  const priority = Number(faq.priority || 100)
  const priorityBonus = Math.max(0, 20 - Math.min(20, priority / 5))

  score += priorityBonus

  return Math.min(100, Math.round(score))
}

function getBestMatch(message, faqs) {
  const scored = (faqs || [])
    .map((faq) => ({
      faq,
      confidence: scoreFaq(message, faq)
    }))
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence
      return Number(a.faq.priority || 100) - Number(b.faq.priority || 100)
    })

  return scored[0] || null
}

function getIncomingTime(row) {
  return row?.received_at || row?.created_at || row?.updated_at || null
}

async function getSettings() {
  const result = await supabaseAdmin
    .from('chatbot_settings')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (result.error) throw new Error(result.error.message)

  return (
    result.data || {
      bot_enabled: false,
      auto_reply_enabled: false,
      assist_only: true,
      fallback_message: 'Terima kasih, pesan Anda sudah kami terima. Admin kami akan membantu segera.',
      handoff_keywords: ['admin', 'cs', 'operator', 'manusia', 'bantuan'],
      auto_reply_min_confidence: 70
    }
  )
}

async function isInside24hWindow(phone) {
  const clean = cleanPhone(phone)
  const variants = phoneVariants(clean)

  if (!variants.length) return false

  const result = await supabaseAdmin
    .from('wa_incoming_messages')
    .select('*')
    .in('phone', variants)
    .order('created_at', { ascending: false })
    .limit(20)

  if (result.error) return false

  const rows = result.data || []
  const latest = rows.find((row) => cleanPhone(row.phone) === clean) || rows[0]
  const latestTime = getIncomingTime(latest)

  if (!latestTime) return false

  const ageMs = Date.now() - new Date(latestTime).getTime()

  return ageMs >= 0 && ageMs <= 24 * 60 * 60 * 1000
}

async function logBot({ phone, incomingMessage, match, answer, confidence, sent }) {
  try {
    await supabaseAdmin.from('chatbot_logs').insert({
      phone: cleanPhone(phone) || null,
      incoming_message: incomingMessage,
      matched_faq_id: match?.faq?.id || null,
      matched_question: match?.faq?.question || null,
      bot_answer: answer,
      confidence,
      mode: 'auto_reply',
      sent
    })
  } catch (error) {
    // ignore
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')

  try {
    const authUser = requireRole(req, res, ['master', 'admin'])
    if (!authUser) return

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const phone = cleanPhone(req.body?.phone)
    const incomingMessage = cleanText(req.body?.message)

    if (!phone || !incomingMessage) {
      return res.status(400).json({
        success: false,
        message: 'phone dan message wajib diisi.'
      })
    }

    const settings = await getSettings()

    if (!settings.bot_enabled || !settings.auto_reply_enabled) {
      return res.status(200).json({
        success: true,
        skipped: true,
        reason: 'Auto reply belum aktif.'
      })
    }

    const insideWindow = await isInside24hWindow(phone)

    if (!insideWindow) {
      return res.status(200).json({
        success: true,
        skipped: true,
        reason: 'Di luar window 24 jam. Auto reply free text tidak dikirim.'
      })
    }

    if (includesAny(incomingMessage, settings.handoff_keywords || [])) {
      const answer = 'Baik, saya bantu teruskan ke admin/CS agar dapat dibantu langsung.'

      await logBot({
        phone,
        incomingMessage,
        match: null,
        answer,
        confidence: 100,
        sent: false
      })

      return res.status(200).json({
        success: true,
        skipped: true,
        reason: 'Handoff keyword terdeteksi.'
      })
    }

    const faqsResult = await supabaseAdmin
      .from('chatbot_faqs')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false })

    if (faqsResult.error) {
      return res.status(500).json({
        success: false,
        message: faqsResult.error.message
      })
    }

    const faqs = faqsResult.data || []
    const match = getBestMatch(incomingMessage, faqs)
    const confidence = match ? match.confidence : 0
    const minConfidence = Number(settings.auto_reply_min_confidence || 70)

    if (!match || confidence < minConfidence) {
      await logBot({
        phone,
        incomingMessage,
        match,
        answer: settings.fallback_message,
        confidence,
        sent: false
      })

      return res.status(200).json({
        success: true,
        skipped: true,
        reason: `Confidence ${confidence} di bawah threshold ${minConfidence}.`
      })
    }

    const answer = match.faq.answer

    const sendResult = await sendWhatsAppText({
      phone,
      message: answer
    })

    await supabaseAdmin.from('wa_outgoing_messages').insert({
      phone,
      message: answer,
      status: sendResult.ok ? 'sent' : 'failed',
      meta_message_id: sendResult.messageId || null,
      error_message: sendResult.error || null,
      sent_by: 'chatbot'
    })

    await supabaseAdmin.from('wa_conversations').upsert(
      {
        phone,
        last_message: answer,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        onConflict: 'phone'
      }
    )

    await logBot({
      phone,
      incomingMessage,
      match,
      answer,
      confidence,
      sent: Boolean(sendResult.ok)
    })

    if (!sendResult.ok) {
      return res.status(400).json({
        success: false,
        message: sendResult.error || 'Auto reply gagal dikirim.'
      })
    }

    return res.status(200).json({
      success: true,
      sent: true,
      confidence,
      answer,
      matched_faq: match.faq
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Auto reply gagal.'
    })
  }
}