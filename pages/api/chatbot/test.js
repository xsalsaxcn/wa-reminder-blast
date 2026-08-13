import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function cleanText(value) {
  return String(value || '').trim()
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
      handoff_keywords: ['admin', 'cs', 'operator', 'manusia', 'bantuan']
    }
  )
}

async function logTest({ phone, incomingMessage, match, answer, confidence, mode }) {
  try {
    await supabaseAdmin.from('chatbot_logs').insert({
      phone: cleanText(phone) || null,
      incoming_message: incomingMessage,
      matched_faq_id: match?.faq?.id || null,
      matched_question: match?.faq?.question || null,
      bot_answer: answer,
      confidence,
      mode,
      sent: false
    })
  } catch (error) {
    // log failure must not break chatbot test
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')

  try {
    const authUser = requireRole(req, res, ['master', 'admin', 'user', 'agent'])
    if (!authUser) return

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    const message = cleanText(req.body?.message)
    const phone = cleanText(req.body?.phone)

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message wajib diisi.'
      })
    }

    const settings = await getSettings()

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
    const handoff = includesAny(message, settings.handoff_keywords || [])
    const match = getBestMatch(message, faqs)
    const confidence = match ? match.confidence : 0

    let answer = settings.fallback_message
    let status = 'fallback'
    let matchedFaq = null

    if (handoff) {
      answer = 'Baik, saya bantu teruskan ke admin/CS agar dapat dibantu langsung.'
      status = 'handoff'
    } else if (match && confidence >= 35) {
      answer = match.faq.answer
      matchedFaq = match.faq
      status = 'matched'
    }

    const mode = settings.auto_reply_enabled ? 'auto_reply' : 'assist'

    await logTest({
      phone,
      incomingMessage: message,
      match,
      answer,
      confidence,
      mode
    })

    return res.status(200).json({
      success: true,
      status,
      mode,
      confidence,
      answer,
      matched_faq: matchedFaq,
      settings: {
        bot_enabled: Boolean(settings.bot_enabled),
        auto_reply_enabled: Boolean(settings.auto_reply_enabled),
        assist_only: Boolean(settings.assist_only)
      }
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal test chatbot.'
    })
  }
}