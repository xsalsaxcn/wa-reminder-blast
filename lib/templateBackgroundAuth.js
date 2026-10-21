import crypto from 'crypto'

function cleanText(value) {
  return String(value || '').trim()
}

function getSecret() {
  return cleanText(
    process.env.NOTIVA_BACKGROUND_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  )
}

export function createBackgroundRunToken(jobId) {
  const cleanJobId = cleanText(jobId)
  const secret = getSecret()
  if (!cleanJobId || !secret) throw new Error('Background runner secret tidak tersedia.')
  const issuedAt = Math.floor(Date.now() / 1000)
  const payload = `${cleanJobId}:${issuedAt}`
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return `${issuedAt}.${signature}`
}

export function verifyBackgroundRunToken(jobId, token, maxAgeSeconds = 300) {
  const cleanJobId = cleanText(jobId)
  const cleanToken = cleanText(token)
  const secret = getSecret()
  if (!cleanJobId || !cleanToken || !secret) return false
  const [issuedAtText, suppliedSignature] = cleanToken.split('.')
  const issuedAt = Number(issuedAtText)
  if (!Number.isFinite(issuedAt) || !suppliedSignature) return false
  const age = Math.floor(Date.now() / 1000) - issuedAt
  if (age < -30 || age > maxAgeSeconds) return false
  const expected = crypto.createHmac('sha256', secret)
    .update(`${cleanJobId}:${issuedAt}`)
    .digest('hex')
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(suppliedSignature, 'hex')
    )
  } catch (error) {
    return false
  }
}

export function getRequestBaseUrl(req) {
  const proto = cleanText(req.headers['x-forwarded-proto']) || 'https'
  const host = cleanText(req.headers['x-forwarded-host'] || req.headers.host)
  if (!host) throw new Error('Host background runner tidak tersedia.')
  return `${proto}://${host}`
}
