New-Item -ItemType Directory -Force -Path "pages\api\settings" | Out-Null
New-Item -ItemType Directory -Force -Path "pages\admin" | Out-Null

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { type } = req.query

      let query = supabaseAdmin
        .from('whatsapp_settings')
        .select('*')
        .order('type', { ascending: true })

      if (type) {
        query = query.eq('type', type)
      }

      const { data, error } = await query

      if (error) throw error

      return res.status(200).json({
        success: true,
        data: type ? data?.[0] || null : data || []
      })
    }

    if (req.method === 'POST') {
      const {
        type,
        message_mode,
        template_name,
        language_code,
        template_variables,
        default_message
      } = req.body

      if (!type || !['reminder', 'blast'].includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'type harus reminder atau blast'
        })
      }

      const payload = {
        type,
        message_mode: message_mode || 'text',
        template_name: template_name || null,
        language_code: language_code || 'id',
        template_variables: Array.isArray(template_variables) ? template_variables : [],
        default_message: default_message || '',
        updated_at: new Date().toISOString()
      }

      const { data, error } = await supabaseAdmin
        .from('whatsapp_settings')
        .upsert(payload, { onConflict: 'type' })
        .select()
        .single()

      if (error) throw error

      return res.status(200).json({
        success: true,
        message: 'WhatsApp setting berhasil disimpan',
        data
      })
    }

    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\settings\whatsapp.js"

@'
import { useEffect, useState } from 'react'
import AppLayout from '../../components/AppLayout'

const defaultForms = {
  reminder: {
    type: 'reminder',
    message_mode: 'text',
    template_name: '',
    language_code: 'id',
    template_variables: 'name,reminder_date,reminder_time',
    default_message: 'Halo {name}, ini reminder untuk jadwal Anda pada {reminder_date} pukul {reminder_time}.'
  },
  blast: {
    type: 'blast',
    message_mode: 'text',
    template_name: '',
    language_code: 'id',
    template_variables: 'name',
    default_message: 'Halo {name}, ini informasi terbaru dari layanan kami.'
  }
}

export default function WhatsAppSettingsPage() {
  const [forms, setForms] = useState(defaultForms)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function loadSettings() {
    const res = await fetch('/api/settings/whatsapp')
    const json = await res.json()

    if (!json.success) return

    const nextForms = { ...defaultForms }

    for (const item of json.data || []) {
      nextForms[item.type] = {
        type: item.type,
        message_mode: item.message_mode || 'text',
        template_name: item.template_name || '',
        language_code: item.language_code || 'id',
        template_variables: Array.isArray(item.template_variables)
          ? item.template_variables.join(',')
          : '',
        default_message: item.default_message || ''
      }
    }

    setForms(nextForms)
  }

  function updateForm(type, field, value) {
    setForms((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [field]: value
      }
    }))
  }

  async function saveSetting(type) {
    setLoading(true)
    setMessage('')

    const form = forms[type]

    const variables = form.template_variables
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    const res = await fetch('/api/settings/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        message_mode: form.message_mode,
        template_name: form.template_name,
        language_code: form.language_code,
        template_variables: variables,
        default_message: form.default_message
      })
    })

    const json = await res.json()
    setLoading(false)
    setMessage(json.message || 'Selesai')
  }

  useEffect(() => {
    loadSettings()
  }, [])

  function SettingCard({ type, title, description }) {
    const form = forms[type]

    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm text-slate-500">{description}</p>

        <label className="mt-5 block text-sm font-semibold text-slate-700">
          Mode Pengiriman
        </label>
        <select
          value={form.message_mode}
          onChange={(e) => updateForm(type, 'message_mode', e.target.value)}
          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
        >
          <option value="text">Text Message</option>
          <option value="template">Template Message</option>
        </select>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold text-slate-700">
              Template Name
            </label>
            <input
              value={form.template_name}
              onChange={(e) => updateForm(type, 'template_name', e.target.value)}
              placeholder="Contoh: reminder_mcu"
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">
              Language Code
            </label>
            <input
              value={form.language_code}
              onChange={(e) => updateForm(type, 'language_code', e.target.value)}
              placeholder="id"
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
            />
          </div>
        </div>

        <label className="mt-5 block text-sm font-semibold text-slate-700">
          Template Variables
        </label>
        <input
          value={form.template_variables}
          onChange={(e) => updateForm(type, 'template_variables', e.target.value)}
          placeholder="name,reminder_date,reminder_time"
          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
        />

        <p className="mt-2 text-xs text-slate-500">
          Isi dengan nama kolom kontak, pisahkan koma. Contoh: name, reminder_date, reminder_time
        </p>

        <label className="mt-5 block text-sm font-semibold text-slate-700">
          Default Text Message
        </label>
        <textarea
          value={form.default_message}
          onChange={(e) => updateForm(type, 'default_message', e.target.value)}
          rows={4}
          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
        />

        <p className="mt-2 text-xs text-slate-500">
          Bisa pakai placeholder: {'{name}'}, {'{phone}'}, {'{reminder_date}'}, {'{reminder_time}'}
        </p>

        <button
          onClick={() => saveSetting(type)}
          disabled={loading}
          className="mt-6 rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {loading ? 'Saving...' : `Simpan ${title}`}
        </button>
      </div>
    )
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">WhatsApp Settings</h1>
          <p className="mt-2 text-slate-500">
            Atur mode pengiriman Reminder dan WhatsApp Blast.
          </p>
        </div>

        {message && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <SettingCard
            type="reminder"
            title="Reminder Settings"
            description="Konfigurasi pesan untuk fitur reminder."
          />

          <SettingCard
            type="blast"
            title="WhatsApp Blast Settings"
            description="Konfigurasi pesan untuk fitur broadcast."
          />
        </div>
      </div>
    </AppLayout>
  )
}
'@ | Set-Content -Encoding UTF8 "pages\admin\whatsapp-settings.js"

@'
import Link from 'next/link'
import { useRouter } from 'next/router'

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/reminder', label: 'Reminder' },
  { href: '/blast', label: 'WhatsApp Blast' },
  { href: '/admin/import-reminder', label: 'Import Reminder' },
  { href: '/admin/import-blast', label: 'Import Blast' },
  { href: '/admin/meta-test', label: 'Meta API Test' },
  { href: '/admin/whatsapp-settings', label: 'WhatsApp Settings' },
  { href: '/admin/manage-users', label: 'Manage Users' },
  { href: '/admin/reset-db', label: 'Reset DB' },
  { href: '/logs', label: 'Logs' }
]

export default function Sidebar() {
  const router = useRouter()

  return (
    <aside className="hidden min-h-screen w-72 shrink-0 border-r border-slate-200 bg-white px-5 py-6 lg:block">
      <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-sky-500 p-5 text-white shadow-lg shadow-indigo-100">
        <p className="text-sm font-medium opacity-90">Notiva</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight">WhatsApp Blast & Reminder</h1>
      </div>

      <nav className="mt-6 space-y-1">
        {navItems.map((item) => {
          const active = router.pathname === item.href

          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                active
                  ? 'block rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700'
                  : 'block rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-6 rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
        <p className="text-sm font-bold text-emerald-700">System Online</p>
        <p className="mt-1 text-xs text-emerald-600">
          Supabase dan Meta API siap dikonfigurasi.
        </p>
      </div>
    </aside>
  )
}
'@ | Set-Content -Encoding UTF8 "components\Sidebar.js"

@'
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
    .eq('type', 'reminder')
    .maybeSingle()

  if (error) throw error

  return data || {
    message_mode: 'text',
    template_variables: [],
    default_message: 'Halo {name}, ini reminder dari layanan kami.'
  }
}

export default async function handler(req, res) {
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
        message: 'Kontak reminder kosong'
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

      await supabaseAdmin.from('reminder_logs').insert({
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
      message: `Reminder selesai. Terkirim: ${sent}, Gagal: ${failed}`,
      sent,
      failed
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Run reminder gagal'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\reminder\run.js"

@'
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
'@ | Set-Content -Encoding UTF8 "pages\api\blast\run.js"

Write-Host "WhatsApp settings setup selesai."
