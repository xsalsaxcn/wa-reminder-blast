import { supabaseAdmin } from '../../../lib/supabaseAdmin'

function cleanPhone(phone) {
  return String(phone || '').replace(/\D/g, '')
}

function getIncomingBody(message) {
  if (message.type === 'text') return message.text?.body || ''
  if (message.type === 'image') return message.image?.caption || '[image]'
  if (message.type === 'document') return message.document?.caption || message.document?.filename || '[document]'
  if (message.type === 'video') return message.video?.caption || '[video]'
  if (message.type === 'audio') return '[audio]'
  if (message.type === 'sticker') return '[sticker]'
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

        for (const message of messages) {
          const phone = cleanPhone(message.from)
          if (!phone) continue

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

            if (existing?.id) {
              continue
            }
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