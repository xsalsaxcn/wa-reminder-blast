import { supabaseAdmin } from './supabaseAdmin'

function cleanText(value) {
  return String(value || '').trim()
}

function extractMetaMessageId(response) {
  if (!response || typeof response !== 'object') return null

  return (
    response.message_id ||
    response.meta_message_id ||
    response.id ||
    response.messages?.[0]?.id ||
    response.data?.messages?.[0]?.id ||
    response.response?.messages?.[0]?.id ||
    null
  )
}

export async function saveDeliveryLog(payload) {
  try {
    const row = {
      job_id: payload.job_id || null,
      item_id: payload.item_id || null,
      phone: cleanText(payload.phone) || null,
      message: cleanText(payload.message) || null,
      status: cleanText(payload.status) || 'unknown',
      channel: cleanText(payload.channel) || 'whatsapp',
      mode: cleanText(payload.mode) || 'text',
      error_message: cleanText(payload.error_message) || null,
      meta_message_id: payload.meta_message_id || extractMetaMessageId(payload.meta_response) || null,
      meta_response: payload.meta_response || null
    }

    await supabaseAdmin
      .from('send_delivery_logs')
      .insert(row)
  } catch (error) {
    console.error('saveDeliveryLog failed:', error.message)
  }
}