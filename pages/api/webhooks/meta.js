import { supabaseAdmin } from '../../../lib/supabaseAdmin'

function getTextFromMessage(message) {
  if (!message) return ''

  if (message.type === 'text') {
    return message.text?.body || ''
  }

  if (message.type === 'button') {
    return message.button?.text || ''
  }

  if (message.type === 'interactive') {
    return (
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title ||
      '[interactive message]'
    )
  }

  if (message.type === 'image') return '[image]'
  if (message.type === 'document') return '[document]'
  if (message.type === 'audio') return '[audio]'
  if (message.type === 'video') return '[video]'
  if (message.type === 'location') return '[location]'

  return `[${message.type || 'unknown'} message]`
}

async function saveIncomingMessage({ phone, profileName, message }) {
  const body = getTextFromMessage(message)
  const receivedAt = message.timestamp
    ? new Date(Number(message.timestamp) * 1000).toISOString()
    : new Date().toISOString()

  await supabaseAdmin
    .from('wa_incoming_messages')
    .upsert(
      {
        phone,
        profile_name: profileName || null,
        message_id: message.id || null,
        message_type: message.type || null,
        body,
        raw: message,
        received_at: receivedAt
      },
      {
        onConflict: 'message_id',
        ignoreDuplicates: true
      }
    )

  await supabaseAdmin
    .from('wa_conversations')
    .upsert(
      {
        phone,
        profile_name: profileName || null,
        last_message: body,
        last_message_at: receivedAt,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: 'phone'
      }
    )

  const { data: conversation } = await supabaseAdmin
    .from('wa_conversations')
    .select('unread_count')
    .eq('phone', phone)
    .maybeSingle()

  await supabaseAdmin
    .from('wa_conversations')
    .update({
      unread_count: Number(conversation?.unread_count || 0) + 1,
      updated_at: new Date().toISOString()
    })
    .eq('phone', phone)
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

  if (req.method === 'POST') {
    try {
      const body = req.body

      const entries = body?.entry || []

      for (const entry of entries) {
        const changes = entry?.changes || []

        for (const change of changes) {
          const value = change?.value || {}
          const contacts = value?.contacts || []
          const messages = value?.messages || []

          for (const message of messages) {
            const phone = message.from
            const contact = contacts.find((item) => item.wa_id === phone)
            const profileName = contact?.profile?.name || null

            if (phone) {
              await saveIncomingMessage({
                phone,
                profileName,
                message
              })
            }
          }
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Webhook received'
      })
    } catch (error) {
      console.error('META_WEBHOOK_ERROR:', error)

      return res.status(500).json({
        success: false,
        message: error.message || 'Webhook error'
      })
    }
  }

  return res.status(405).json({
    success: false,
    message: 'Method not allowed'
  })
}
