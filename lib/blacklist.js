import { supabaseAdmin } from './supabaseAdmin'

export function cleanPhone(phone) {
  return String(phone || '')
    .replace(/\D/g, '')
    .replace(/^0/, '62')
}

export async function isPhoneBlacklisted(phone) {
  const clean = cleanPhone(phone)

  if (!clean) return false

  const { data, error } = await supabaseAdmin
    .from('wa_blacklist')
    .select('phone')
    .eq('phone', clean)
    .maybeSingle()

  if (error) {
    return false
  }

  return Boolean(data?.phone)
}

export async function getBlacklistPhones() {
  const { data, error } = await supabaseAdmin
    .from('wa_blacklist')
    .select('phone')

  if (error) {
    return new Set()
  }

  return new Set((data || []).map((item) => cleanPhone(item.phone)).filter(Boolean))
}

export async function upsertBlacklist({
  phone,
  profile_name = null,
  reason = '',
  source = 'manual',
  created_by = null
}) {
  const clean = cleanPhone(phone)

  if (!clean) {
    throw new Error('Phone is required')
  }

  const { data, error } = await supabaseAdmin
    .from('wa_blacklist')
    .upsert(
      {
        phone: clean,
        profile_name,
        reason,
        source,
        created_by,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: 'phone'
      }
    )
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function removeBlacklist(phone) {
  const clean = cleanPhone(phone)

  if (!clean) {
    throw new Error('Phone is required')
  }

  const { error } = await supabaseAdmin
    .from('wa_blacklist')
    .delete()
    .eq('phone', clean)

  if (error) {
    throw new Error(error.message)
  }

  return true
}