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
