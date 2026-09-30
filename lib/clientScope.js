import { supabaseAdmin } from './supabaseAdmin'
import { parseCookies } from './auth'

export const ACTIVE_CLIENT_COOKIE = 'notiva_active_client_id'

function cleanText(value) {
  return String(value || '').trim()
}

function appendCookie(res, cookieValue) {
  const current = res.getHeader('Set-Cookie')

  if (!current) {
    res.setHeader('Set-Cookie', cookieValue)
    return
  }

  const list = Array.isArray(current) ? current : [current]
  res.setHeader('Set-Cookie', [...list, cookieValue])
}

async function readUserClientId(authUser) {
  const tokenClientId = cleanText(authUser?.client_id)
  if (tokenClientId) return tokenClientId

  const userId = cleanText(authUser?.id)
  if (!userId) return ''

  const result = await supabaseAdmin
    .from('app_users')
    .select('client_id')
    .eq('id', userId)
    .maybeSingle()

  if (result.error) throw new Error(result.error.message)

  return cleanText(result.data?.client_id)
}

async function getClientById(clientId, includeInactive = false) {
  if (!clientId) return null

  let query = supabaseAdmin
    .from('clients')
    .select('id, code, name, brand_name, status, pic_name, pic_email, pic_phone, notes, created_at, updated_at')
    .eq('id', clientId)

  if (!includeInactive) query = query.eq('status', 'active')

  const result = await query.maybeSingle()

  if (result.error) throw new Error(result.error.message)

  return result.data || null
}

async function getLegacyClient() {
  const result = await supabaseAdmin
    .from('clients')
    .select('id, code, name, brand_name, status, pic_name, pic_email, pic_phone, notes, created_at, updated_at')
    .eq('code', 'IHC')
    .eq('status', 'active')
    .maybeSingle()

  if (result.error) throw new Error(result.error.message)

  if (result.data) return result.data

  const fallback = await supabaseAdmin
    .from('clients')
    .select('id, code, name, brand_name, status, pic_name, pic_email, pic_phone, notes, created_at, updated_at')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (fallback.error) throw new Error(fallback.error.message)

  return fallback.data || null
}

export async function resolveClientContext(req, authUser) {
  if (!authUser) {
    const error = new Error('Unauthorized')
    error.statusCode = 401
    throw error
  }

  const role = cleanText(authUser.role).toLowerCase()
  const assignedClientId = await readUserClientId(authUser)
  let client = null

  if (role === 'master') {
    const cookies = parseCookies(req)
    const selectedId = cleanText(cookies[ACTIVE_CLIENT_COOKIE])

    if (selectedId) {
      client = await getClientById(selectedId, false)
    }

    if (!client && assignedClientId) {
      client = await getClientById(assignedClientId, false)
    }

    if (!client) {
      client = await getLegacyClient()
    }
  } else {
    if (!assignedClientId) {
      const error = new Error('User belum memiliki client_id. Hubungi Master Admin.')
      error.statusCode = 403
      throw error
    }

    client = await getClientById(assignedClientId, false)
  }

  if (!client) {
    const error = new Error('Client aktif tidak ditemukan.')
    error.statusCode = 403
    throw error
  }

  return {
    clientId: client.id,
    client,
    canSwitch: role === 'master'
  }
}

export async function requireClientContext(req, res, authUser) {
  try {
    return await resolveClientContext(req, authUser)
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Client context error'
    })
    return null
  }
}

export async function listActiveClients() {
  const result = await supabaseAdmin
    .from('clients')
    .select('id, code, name, brand_name, status, pic_name, pic_email, pic_phone, notes, created_at, updated_at')
    .eq('status', 'active')
    .order('name', { ascending: true })

  if (result.error) throw new Error(result.error.message)

  return result.data || []
}

export async function setActiveClientCookie(res, clientId) {
  const client = await getClientById(cleanText(clientId), false)

  if (!client) {
    const error = new Error('Client aktif tidak ditemukan.')
    error.statusCode = 404
    throw error
  }

  appendCookie(
    res,
    `${ACTIVE_CLIENT_COOKIE}=${encodeURIComponent(client.id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 12}`
  )

  return client
}
