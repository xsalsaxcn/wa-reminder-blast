// NOTIVA_PATCH_07_SAFE_JOTFORM_LIVE_READ_ONLY_V1
import crypto from 'crypto'

export const NOTIVA_AI_TIMEZONE = 'Asia/Jakarta'

export const PENDING_STATUSES = ['pending', 'queued', 'processing', 'scheduled']
export const SENT_STATUSES = ['sent', 'success', 'done', 'completed']
export const DELIVERED_STATUSES = ['delivered']
export const READ_STATUSES = ['read']
export const FAILED_STATUSES = ['failed', 'error', 'undelivered', 'rejected', 'cancelled', 'canceled']

export function cleanText(value) {
  return String(value ?? '').trim()
}

export function cleanPhone(value) {
  let phone = cleanText(value)
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

export function phoneVariants(value) {
  const phone = cleanPhone(value)
  if (!phone) return []

  const values = new Set([phone, '+' + phone])

  if (phone.startsWith('62') && phone.length > 2) {
    values.add('0' + phone.slice(2))
  }

  return Array.from(values)
}

export function maskPhone(value) {
  const phone = cleanPhone(value)
  if (!phone) return ''
  if (phone.length <= 6) return phone.slice(0, 2) + '***'
  return phone.slice(0, 5) + '*'.repeat(Math.max(3, phone.length - 8)) + phone.slice(-3)
}

export function readInput(req, names, fallback = '') {
  const keys = Array.isArray(names) ? names : [names]

  for (const key of keys) {
    const fromQuery = req?.query?.[key]
    if (Array.isArray(fromQuery) && fromQuery.length) return cleanText(fromQuery[0])
    if (fromQuery !== undefined && fromQuery !== null && cleanText(fromQuery)) return cleanText(fromQuery)

    const fromBody = req?.body?.[key]
    if (Array.isArray(fromBody) && fromBody.length) return cleanText(fromBody[0])
    if (fromBody !== undefined && fromBody !== null && cleanText(fromBody)) return cleanText(fromBody)
  }

  return fallback
}

export function setReadOnlyHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  res.setHeader('X-Notiva-AI-Scope', 'read-only')
  res.setHeader('X-Notiva-AI-Version', 'phase2-v1')
}

function timingSafeEqualText(left, right) {
  const a = Buffer.from(cleanText(left), 'utf8')
  const b = Buffer.from(cleanText(right), 'utf8')

  if (!a.length || !b.length || a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export function requireAiReadToken(req, res) {
  const expected = cleanText(process.env.NOTIVA_AI_READ_TOKEN)

  if (!expected) {
    res.status(503).json({
      success: false,
      read_only: true,
      message: 'NOTIVA_AI_READ_TOKEN belum dikonfigurasi di server.'
    })
    return false
  }

  const headerToken = cleanText(req.headers['x-notiva-ai-token'])
  const authHeader = cleanText(req.headers.authorization)
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? cleanText(authHeader.slice(7))
    : ''
  const provided = headerToken || bearerToken

  if (!timingSafeEqualText(provided, expected)) {
    res.status(401).json({
      success: false,
      read_only: true,
      message: 'Unauthorized AI read-only request.'
    })
    return false
  }

  return true
}

export function requireReadOnlyMethod(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    res.status(405).json({
      success: false,
      read_only: true,
      message: 'Method not allowed. Endpoint ini hanya menerima request baca.'
    })
    return false
  }

  return true
}

export function sanitizeSearchTerm(value) {
  return cleanText(value)
    .replace(/[%,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
    .trim()
}

function jakartaDateText(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NOTIVA_AI_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${map.year}-${map.month}-${map.day}`
}

function nextDateText(dateText) {
  const date = new Date(`${dateText}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return ''
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

export function jakartaDayRange(value = '') {
  const input = cleanText(value)
  const dateText = /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : jakartaDateText()
  const next = nextDateText(dateText)

  return {
    date: dateText,
    timezone: NOTIVA_AI_TIMEZONE,
    start: new Date(`${dateText}T00:00:00+07:00`).toISOString(),
    end_exclusive: new Date(`${next}T00:00:00+07:00`).toISOString()
  }
}

export function isoOrNull(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function numeric(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function ageMinutes(value) {
  if (!value) return null
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return null
  return Math.max(0, Math.round((Date.now() - time) / 60000))
}
