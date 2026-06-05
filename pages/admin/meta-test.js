import { useState } from 'react'
import AppLayout from '../../components/AppLayout'

export default function MetaTestPage() {
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('Halo, ini test pesan dari sistem WA Reminder & Blast.')
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
