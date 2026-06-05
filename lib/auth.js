import crypto from 'crypto'

const COOKIE_NAME = 'wa_auth_token'

function getSecret() {
  return process.env.AUTH_SECRET || 'dev_secret_change_me'
}

function base64url(input) {
  return Buffer.from(JSON.stringify(input))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function decodeBase64url(input) {
  input = input.replace(/-/g, '+').replace(/_/g, '/')
  while (input.length % 4) input += '='
  return JSON.parse(Buffer.from(input, 'base64').toString('utf8'))
}

export function signToken(payload) {
  const header = base64url({ alg: 'HS256', typ: 'JWT' })
  const body = base64url({
    ...payload,
    exp: Date.now() + 1000 * 60 * 60 * 12
  })

  const signature = crypto
    .createHmac('sha256', getSecret())
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return `${header}.${body}.${signature}`
}

export function verifyToken(token) {
  if (!token) return null

  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [header, body, signature] = parts

  const expected = crypto
    .createHmac('sha256', getSecret())
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  if (signature !== expected) return null

  const payload = decodeBase64url(body)

  if (payload.exp && Date.now() > payload.exp) {
    return null
  }

  return payload
}

export function parseCookies(req) {
  const cookieHeader = req.headers.cookie || ''
  return cookieHeader.split(';').reduce((cookies, cookie) => {
    const [name, ...rest] = cookie.trim().split('=')
    if (!name) return cookies
    cookies[name] = decodeURIComponent(rest.join('='))
    return cookies
  }, {})
}

export function getAuthUser(req) {
  const cookies = parseCookies(req)
  const token = cookies[COOKIE_NAME]
  return verifyToken(token)
}

export function setAuthCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 12}`
  )
}

export function clearAuthCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  )
}

export function requireRole(req, res, roles = []) {
  const user = getAuthUser(req)

  if (!user) {
    res.status(401).json({
      success: false,
      message: 'Unauthorized'
    })
    return null
  }

  if (roles.length > 0 && !roles.includes(user.role)) {
    res.status(403).json({
      success: false,
      message: 'Forbidden'
    })
    return null
  }

  return user
}
