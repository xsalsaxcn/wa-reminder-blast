import { supabaseAdmin } from '../../../lib/supabaseAdmin'

function cleanText(value) {
  return String(value || '').trim()
}

function cleanPhone(phone) {
  return String(phone || '').replace(/\D/g, '')
}

function getIncomingBody(message) {
  if (!message || typeof message !== 'object') return ''

  if (message.type === 'text') {
    return cleanText(message.text?.body)
  }

  // Tombol dari template lama / quick reply button.
  if (message.type === 'button') {
    return cleanText(
      message.button?.text ||
      message.button?.payload ||
      message.button?.title ||
      '[button]'
    )
  }

  // Tombol interactive, termasuk button_reply dan list_reply.
  if (message.type === 'interactive') {
    const interactiveType = cleanText(message.interactive?.type)

    if (interactiveType === 'button_reply') {
      return cleanText(
        message.interactive?.button_reply?.title ||
        message.interactive?.button_reply?.id ||
        '[button]'
      )
    }

    if (interactiveType === 'list_reply') {
      return cleanText(
        message.interactive?.list_reply?.title ||
        message.interactive?.list_reply?.id ||
        '[list]'
      )
    }

    return '[interactive]'
  }

  if (message.type === 'image') {
    return cleanText(message.image?.caption) || '[image]'
  }

  if (message.type === 'document') {
    return cleanText(message.document?.caption || message.document?.filename) || '[document]'
  }

  if (message.type === 'video') {
    return cleanText(message.video?.caption) || '[video]'
  }

  if (message.type === 'audio') return '[audio]'
  if (message.type === 'sticker') return '[sticker]'
  if (message.type === 'location') return '[location]'
  if (message.type === 'contacts') return '[contact]'
  if (message.type === 'reaction') return cleanText(message.reaction?.emoji) || '[reaction]'

  return `[${message.type || 'message'}]`
}

function getMediaInfo(message) {
  const type = message.type

  if (!['image', 'document', 'video', 'audio', 'sticker'].includes(type)) {
    return {
      media_id: null,
      media_mime_type: null,
      media_filename: null,
      media_caption: null
    }
  }

  const media = message[type] || {}

  return {
    media_id: media.id || null,
    media_mime_type: media.mime_type || null,
    media_filename: media.filename || null,
    media_caption: media.caption || null
  }
}

async function saveIncomingMessage({ message, contacts }) {
  const phone = cleanPhone(message.from)
  if (!phone) return

  const profileName =
    contacts.find((contact) => cleanPhone(contact.wa_id) === phone)?.profile?.name ||
    contacts[0]?.profile?.name ||
    phone

  const receivedAt = message.timestamp
    ? new Date(Number(message.timestamp) * 1000).toISOString()
    : new Date().toISOString()

  const bodyText = getIncomingBody(message)
  const mediaInfo = getMediaInfo(message)

  if (message.id) {
    const { data: existing } = await supabaseAdmin
      .from('wa_incoming_messages')
      .select('id')
      .eq('whatsapp_message_id', message.id)
      .maybeSingle()

    if (existing?.id) return
  }

  await supabaseAdmin
    .from('wa_incoming_messages')
    .insert({
      whatsapp_message_id: message.id || null,
      phone,
      profile_name: profileName,
      body: bodyText,
      received_at: receivedAt,
      message_type: message.type || 'text',
      media_id: mediaInfo.media_id,
      media_mime_type: mediaInfo.media_mime_type,
      media_filename: mediaInfo.media_filename,
      media_caption: mediaInfo.media_caption
    })

  await supabaseAdmin
    .from('wa_conversations')
    .upsert(
      {
        phone,
        profile_name: profileName,
        last_message: bodyText,
        last_message_at: receivedAt,
        unread_count: 1,
        status: 'open',
        updated_at: new Date().toISOString()
      },
      {
        onConflict: 'phone'
      }
    )
}

async function saveStatusUpdate(statusItem) {
  const metaMessageId = cleanText(statusItem.id)
  const status = cleanText(statusItem.status)

  if (!metaMessageId || !status) return

  const timestamp = statusItem.timestamp
    ? new Date(Number(statusItem.timestamp) * 1000).toISOString()
    : new Date().toISOString()

  const errorMessage = Array.isArray(statusItem.errors)
    ? statusItem.errors
        .map((item) => item.message || item.title || item.details || item.code)
        .filter(Boolean)
        .join(' | ')
    : null

  try {
    await supabaseAdmin
      .from('wa_outgoing_messages')
      .update({
        status,
        error_message: errorMessage,
        sent_at: timestamp
      })
      .eq('meta_message_id', metaMessageId)
  } catch (error) {
    // Jangan gagalkan webhook hanya karena tabel outgoing beda struktur.
  }

  try {
    await supabaseAdmin
      .from('send_delivery_logs')
      .insert({
        meta_message_id: metaMessageId,
        status,
        mode: 'webhook_status',
        error_message: errorMessage,
        meta_response: statusItem,
        created_at: timestamp
      })
  } catch (error) {
    // Jangan gagalkan webhook kalau tabel log belum cocok.
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']

    if (
      mode === 'subscribe' &&
      token === process.env.META_WEBHOOK_VERIFY_TOKEN
    ) {
      return res.status(200).send(challenge)
    }

    return res.status(403).send('Forbidden')
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const body = req.body

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {}
        const contacts = value.contacts || []
        const messages = value.messages || []
        const statuses = value.statuses || []

        for (const statusItem of statuses) {
          await saveStatusUpdate(statusItem)
        }

        for (const message of messages) {
          await saveIncomingMessage({
            message,
            contacts
          })
        }
      }
    }

    return res.status(200).json({
      success: true
    })
  } catch (error) {
    console.error('Webhook error:', error)

    return res.status(200).json({
      success: false,
      message: error.message
    })
  }
}