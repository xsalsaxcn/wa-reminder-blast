New-Item -ItemType Directory -Force -Path "lib" | Out-Null
New-Item -ItemType Directory -Force -Path "pages\api\meta" | Out-Null
New-Item -ItemType Directory -Force -Path "pages\admin" | Out-Null

@'
function normalizePhone(phone) {
  if (!phone) return ''
  let value = String(phone).trim()
  value = value.replace(/[^\d+]/g, '')

  if (value.startsWith('0')) {
    value = '62' + value.slice(1)
  }

  if (value.startsWith('+')) {
    value = value.slice(1)
  }

  return value
}

async function callMetaWhatsApp(payload) {
  const token = process.env.META_WA_TOKEN
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID
  const version = process.env.META_API_VERSION || 'v20.0'

  if (!token || !phoneNumberId) {
    return {
      ok: false,
      error: 'META_WA_TOKEN atau META_PHONE_NUMBER_ID belum diisi di .env.local'
    }
  }

  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  const data = await response.json()

  if (!response.ok) {
    return {
      ok: false,
      error: data?.error?.message || JSON.stringify(data),
      raw: data
    }
  }

  return {
    ok: true,
    messageId: data?.messages?.[0]?.id || null,
    raw: data
  }
}

async function sendWhatsAppText({ phone, message }) {
  const to = normalizePhone(phone)

  return callMetaWhatsApp({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: {
      preview_url: false,
      body: message
    }
  })
}

async function sendWhatsAppTemplate({ phone, templateName, languageCode = 'id', variables = [] }) {
  const to = normalizePhone(phone)

  const components = variables.length > 0
    ? [
        {
          type: 'body',
          parameters: variables.map((item) => ({
            type: 'text',
            text: String(item)
          }))
        }
      ]
    : []

  return callMetaWhatsApp({
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode
      },
      components
    }
  })
}

export {
  normalizePhone,
  sendWhatsAppText,
  sendWhatsAppTemplate
}
'@ | Set-Content -Encoding UTF8 "lib\metaWhatsapp.js"

@'
import { sendWhatsAppText, sendWhatsAppTemplate } from '../../../lib/metaWhatsapp'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const {
      mode,
      phone,
      message,
      templateName,
      languageCode,
      variables
    } = req.body

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Nomor WhatsApp wajib diisi'
      })
    }

    let result

    if (mode === 'template') {
      if (!templateName) {
        return res.status(400).json({
          success: false,
          message: 'Nama template wajib diisi'
        })
      }

      result = await sendWhatsAppTemplate({
        phone,
        templateName,
        languageCode: languageCode || 'id',
        variables: Array.isArray(variables) ? variables : []
      })
    } else {
      if (!message) {
        return res.status(400).json({
          success: false,
          message: 'Message wajib diisi'
        })
      }

      result = await sendWhatsAppText({
        phone,
        message
      })
    }

    if (!result.ok) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Gagal kirim WhatsApp',
        raw: result.raw || null
      })
    }

    return res.status(200).json({
      success: true,
      message: 'WhatsApp berhasil dikirim',
      messageId: result.messageId,
      raw: result.raw
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\meta\test-send.js"

@'
import { useState } from 'react'
import AppLayout from '../../components/AppLayout'

export default function MetaTestPage() {
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('Halo, ini test pesan dari sistem WhatsApp Blast & Reminder.')
  const [templateName, setTemplateName] = useState('')
  const [languageCode, setLanguageCode] = useState('id')
  const [variablesText, setVariablesText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  async function sendTest(mode) {
    setLoading(true)
    setResult(null)

    const variables = variablesText
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    const res = await fetch('/api/meta/test-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        phone,
        message,
        templateName,
        languageCode,
        variables
      })
    })

    const json = await res.json()
    setLoading(false)
    setResult(json)
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Meta WhatsApp API Test</h1>
          <p className="mt-2 text-slate-500">
            Test kirim pesan ke satu nomor sebelum menjalankan reminder atau broadcast.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Test Text Message</h2>

          <label className="mt-5 block text-sm font-semibold text-slate-700">
            Nomor WhatsApp
          </label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Contoh: 6281234567890"
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
          />

          <label className="mt-5 block text-sm font-semibold text-slate-700">
            Pesan
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
          />

          <button
            onClick={() => sendTest('text')}
            disabled={loading}
            className="mt-5 rounded-2xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {loading ? 'Sending...' : 'Send Text Test'}
          </button>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Test Template Message</h2>
          <p className="mt-2 text-sm text-slate-500">
            Gunakan template yang sudah approved di Meta. Isi variables dipisahkan koma sesuai jumlah placeholder template.
          </p>

          <label className="mt-5 block text-sm font-semibold text-slate-700">
            Template Name
          </label>
          <input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Contoh: reminder_mcu"
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
          />

          <label className="mt-5 block text-sm font-semibold text-slate-700">
            Language Code
          </label>
          <input
            value={languageCode}
            onChange={(e) => setLanguageCode(e.target.value)}
            placeholder="id"
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
          />

          <label className="mt-5 block text-sm font-semibold text-slate-700">
            Variables
          </label>
          <input
            value={variablesText}
            onChange={(e) => setVariablesText(e.target.value)}
            placeholder="Contoh: Budi, 10 Juni 2026, 09:00"
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
          />

          <button
            onClick={() => sendTest('template')}
            disabled={loading}
            className="mt-5 rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? 'Sending...' : 'Send Template Test'}
          </button>
        </div>

        {result && (
          <div className={result.success ? 'rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800' : 'rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-800'}>
            <h3 className="font-bold">{result.success ? 'Success' : 'Failed'}</h3>
            <p className="mt-2">{result.message}</p>
            {result.messageId && (
              <p className="mt-2 text-sm">Message ID: {result.messageId}</p>
            )}
            {result.raw && (
              <pre className="mt-4 max-h-80 overflow-auto rounded-2xl bg-white/70 p-4 text-xs">
                {JSON.stringify(result.raw, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
'@ | Set-Content -Encoding UTF8 "pages\admin\meta-test.js"

Write-Host "Meta WhatsApp API test page berhasil dibuat."
