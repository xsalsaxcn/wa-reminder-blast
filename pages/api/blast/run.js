import { requireRole } from '../../../lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { sendWhatsAppText, sendWhatsAppTemplate } from '../../../lib/metaWhatsapp'

function getValue(contact, field) {
  const value = contact?.[field]
  if (value === null || value === undefined) return ''
  return String(value)
}

function interpolateMessage(template, contact) {
  if (!template) return ''

  return template
    .replaceAll('{name}', getValue(contact, 'name'))
    .replaceAll('{phone}', getValue(contact, 'phone'))
    .replaceAll('{message}', getValue(contact, 'message'))
    .replaceAll('{reminder_date}', getValue(contact, 'reminder_date'))
    .replaceAll('{reminder_time}', getValue(contact, 'reminder_time'))
}

async function getSetting() {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_settings')
    .select('*')
    .eq('type', 'blast')
    .maybeSingle()

  if (error) throw error

  return data || {
    message_mode: 'text',
    template_variables: [],
    default_message: 'Halo {name}, ini informasi terbaru dari layanan kami.'
  }
}

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin', 'user'])
  if (!authUser) return

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  }

  try {
    const { databaseId } = req.body

    if (!databaseId) {
      return res.status(400).json({
        success: false,
        message: 'databaseId wajib diisi'
      })
    }

    const setting = await getSetting()

    const { data: contacts, error: contactsError } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('database_id', databaseId)
      .eq('status', 'active')

    if (contactsError) throw contactsError

    if (!contacts || contacts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kontak broadcast kosong'
      })
    }

    let sent = 0
    let failed = 0

    for (const contact of contacts) {
      let result
      let message = contact.message || interpolateMessage(setting.default_message, contact)

      if (setting.message_mode === 'template') {
        const variables = Array.isArray(setting.template_variables)
          ? setting.template_variables.map((field) => getValue(contact, field))
          : []

        result = await sendWhatsAppTemplate({
          phone: contact.phone,
          templateName: setting.template_name,
          languageCode: setting.language_code || 'id',
          variables
        })

        message = `TEMPLATE: ${setting.template_name} | VARS: ${variables.join(', ')}`
      } else {
        result = await sendWhatsAppText({
          phone: contact.phone,
          message
        })
      }

      if (result.ok) sent += 1
      else failed += 1

      await supabaseAdmin.from('blast_logs').insert({
        database_id: databaseId,
        contact_id: contact.id,
        phone: contact.phone,
        message,
        status: result.ok ? 'sent' : 'failed',
        meta_message_id: result.messageId || null,
        error_message: result.error || null
      })
    }

    return res.status(200).json({
      success: true,
      message: `Broadcast selesai. Terkirim: ${sent}, Gagal: ${failed}`,
      sent,
      failed
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Run broadcast gagal'
    })
  }
}

