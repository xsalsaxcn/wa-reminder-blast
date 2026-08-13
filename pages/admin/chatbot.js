import { useEffect, useState } from 'react'
import Sidebar from '../../components/Sidebar'

function cleanText(value) {
  return String(value || '').trim()
}

function keywordsToText(value) {
  if (Array.isArray(value)) return value.join(', ')
  return String(value || '')
}

const emptyForm = {
  id: '',
  question: '',
  answer: '',
  keywords: '',
  category: 'General',
  priority: 100,
  is_active: true
}

export default function AdminChatbotPage() {
  const [faqs, setFaqs] = useState([])
  const [settings, setSettings] = useState({
    bot_enabled: false,
    auto_reply_enabled: false,
    assist_only: true,
    fallback_message: '',
    handoff_keywords: []
  })

  const [form, setForm] = useState(emptyForm)
  const [testMessage, setTestMessage] = useState('')
  const [testPhone, setTestPhone] = useState('')
  const [testResult, setTestResult] = useState(null)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function loadData() {
    setLoading(true)
    setError('')

    try {
      const [faqResponse, settingsResponse] = await Promise.all([
        fetch('/api/chatbot/faqs?t=' + Date.now(), { cache: 'no-store' }),
        fetch('/api/chatbot/settings?t=' + Date.now(), { cache: 'no-store' })
      ])

      const faqData = await faqResponse.json()
      const settingsData = await settingsResponse.json()

      if (!faqResponse.ok || !faqData.success) {
        throw new Error(faqData.message || 'Gagal memuat FAQ.')
      }

      if (!settingsResponse.ok || !settingsData.success) {
        throw new Error(settingsData.message || 'Gagal memuat settings.')
      }

      setFaqs(faqData.faqs || [])
      setSettings(settingsData.settings || settings)
    } catch (err) {
      setError(err.message || 'Gagal memuat chatbot.')
    } finally {
      setLoading(false)
    }
  }

  async function saveFaq(event) {
    event.preventDefault()

    setSaving(true)
    setMessage('')
    setError('')

    try {
      const response = await fetch('/api/chatbot/faqs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(form)
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal simpan FAQ.')
      }

      setForm(emptyForm)
      setMessage('FAQ berhasil disimpan.')
      await loadData()
    } catch (err) {
      setError(err.message || 'Gagal simpan FAQ.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteFaq(id) {
    if (!confirm('Hapus FAQ ini?')) return

    setSaving(true)
    setMessage('')
    setError('')

    try {
      const response = await fetch('/api/chatbot/faqs?id=' + encodeURIComponent(id), {
        method: 'DELETE'
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal hapus FAQ.')
      }

      setMessage('FAQ berhasil dihapus.')
      await loadData()
    } catch (err) {
      setError(err.message || 'Gagal hapus FAQ.')
    } finally {
      setSaving(false)
    }
  }

  async function saveSettings() {
    setSaving(true)
    setMessage('')
    setError('')

    try {
      const response = await fetch('/api/chatbot/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal simpan settings.')
      }

      setSettings(data.settings)
      setMessage('Settings chatbot berhasil disimpan.')
    } catch (err) {
      setError(err.message || 'Gagal simpan settings.')
    } finally {
      setSaving(false)
    }
  }

  async function testChatbot(event) {
    event.preventDefault()

    setSaving(true)
    setTestResult(null)
    setError('')

    try {
      const response = await fetch('/api/chatbot/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone: testPhone,
          message: testMessage
        })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal test chatbot.')
      }

      setTestResult(data)
    } catch (err) {
      setError(err.message || 'Gagal test chatbot.')
    } finally {
      setSaving(false)
    }
  }

  function editFaq(faq) {
    setForm({
      id: faq.id,
      question: faq.question || '',
      answer: faq.answer || '',
      keywords: keywordsToText(faq.keywords),
      category: faq.category || 'General',
      priority: faq.priority || 100,
      is_active: faq.is_active !== false
    })

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  useEffect(() => {
    loadData()
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <Sidebar />

      <main className="min-w-0 flex-1 p-4 lg:p-8">
        <div className="mx-auto max-w-7xl space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-600">
              Notiva Chatbot
            </p>
            <h1 className="mt-2 text-2xl font-black text-slate-950">
              Chatbot FAQ
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Kelola FAQ dan test jawaban chatbot. Tahap ini masih Assist Only, belum auto-reply ke customer.
            </p>
          </div>

          {message ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
              {message}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
            <section className="space-y-5">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black text-slate-950">
                  Settings
                </h2>

                <div className="mt-4 space-y-4">
                  <label className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4">
                    <div>
                      <p className="font-bold text-slate-900">Bot Enabled</p>
                      <p className="text-xs text-slate-500">Aktifkan engine chatbot.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(settings.bot_enabled)}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          bot_enabled: event.target.checked
                        }))
                      }
                    />
                  </label>

                  <label className="flex items-center justify-between gap-4 rounded-2xl bg-amber-50 p-4">
                    <div>
                      <p className="font-bold text-amber-900">Assist Only</p>
                      <p className="text-xs text-amber-700">Bot hanya test/saran jawaban, belum kirim otomatis.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.assist_only !== false}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          assist_only: event.target.checked,
                          auto_reply_enabled: event.target.checked ? false : current.auto_reply_enabled
                        }))
                      }
                    />
                  </label>

                  <label className="flex items-center justify-between gap-4 rounded-2xl bg-red-50 p-4">
                    <div>
                      <p className="font-bold text-red-900">Auto Reply</p>
                      <p className="text-xs text-red-700">Jangan aktifkan dulu sebelum hasil test aman.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(settings.auto_reply_enabled)}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          auto_reply_enabled: event.target.checked,
                          bot_enabled: event.target.checked ? true : current.bot_enabled,
                          assist_only: event.target.checked ? false : current.assist_only
                        }))
                      }
                    />
                  </label>

                  <div>
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Fallback Message
                    </label>
                    <textarea
                      value={settings.fallback_message || ''}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          fallback_message: event.target.value
                        }))
                      }
                      rows={4}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Handoff Keywords
                    </label>
                    <input
                      value={keywordsToText(settings.handoff_keywords)}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          handoff_keywords: event.target.value
                        }))
                      }
                      placeholder="admin, cs, operator, manusia"
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={saveSettings}
                    disabled={saving}
                    className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </div>

              <form onSubmit={testChatbot} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black text-slate-950">
                  Test Chatbot
                </h2>

                <input
                  value={testPhone}
                  onChange={(event) => setTestPhone(event.target.value)}
                  placeholder="Phone optional"
                  className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-500"
                />

                <textarea
                  value={testMessage}
                  onChange={(event) => setTestMessage(event.target.value)}
                  placeholder="Contoh: Saya mau reschedule jadwal"
                  rows={4}
                  className="mt-3 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-500"
                />

                <button
                  type="submit"
                  disabled={saving || !cleanText(testMessage)}
                  className="mt-3 w-full rounded-2xl bg-cyan-600 px-4 py-3 text-sm font-black text-white hover:bg-cyan-700 disabled:opacity-50"
                >
                  Test Answer
                </button>

                {testResult ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Result: {testResult.status} · Confidence {testResult.confidence}
                    </p>
                    <div className="mt-3 whitespace-pre-wrap text-sm font-semibold text-slate-800">
                      {testResult.answer}
                    </div>

                    {testResult.matched_faq ? (
                      <p className="mt-3 text-xs text-slate-500">
                        Matched: {testResult.matched_faq.question}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </form>
            </section>

            <section className="space-y-5">
              <form onSubmit={saveFaq} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-black text-slate-950">
                    {form.id ? 'Edit FAQ' : 'Tambah FAQ'}
                  </h2>

                  {form.id ? (
                    <button
                      type="button"
                      onClick={() => setForm(emptyForm)}
                      className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
                    >
                      Cancel Edit
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Question / Intent
                    </label>
                    <input
                      value={form.question}
                      onChange={(event) => setForm((current) => ({ ...current, question: event.target.value }))}
                      placeholder="Contoh: Saya mau reschedule jadwal"
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Category
                    </label>
                    <input
                      value={form.category}
                      onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                      placeholder="Reminder / Harga / Lokasi"
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Priority
                    </label>
                    <input
                      type="number"
                      value={form.priority}
                      onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Keywords
                    </label>
                    <input
                      value={form.keywords}
                      onChange={(event) => setForm((current) => ({ ...current, keywords: event.target.value }))}
                      placeholder="reschedule, tunda, jadwal ulang"
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Answer
                    </label>
                    <textarea
                      value={form.answer}
                      onChange={(event) => setForm((current) => ({ ...current, answer: event.target.value }))}
                      rows={5}
                      placeholder="Jawaban bot..."
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-500"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
                    />
                    Active
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="mt-4 rounded-2xl bg-cyan-600 px-5 py-3 text-sm font-black text-white hover:bg-cyan-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : form.id ? 'Update FAQ' : 'Save FAQ'}
                </button>
              </form>

              <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 p-5">
                  <h2 className="text-lg font-black text-slate-950">
                    FAQ List
                  </h2>
                  <p className="text-sm text-slate-500">
                    {loading ? 'Loading...' : `${faqs.length} FAQ`}
                  </p>
                </div>

                <div className="divide-y divide-slate-100">
                  {faqs.length === 0 ? (
                    <div className="p-6 text-sm text-slate-500">
                      Belum ada FAQ.
                    </div>
                  ) : (
                    faqs.map((faq) => (
                      <div key={faq.id} className="p-5">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-black text-slate-950">
                                {faq.question}
                              </h3>
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                                {faq.category || 'General'}
                              </span>
                              <span className={faq.is_active ? 'rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700' : 'rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700'}>
                                {faq.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </div>

                            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                              {faq.answer}
                            </p>

                            <p className="mt-3 text-xs text-slate-500">
                              Keywords: {keywordsToText(faq.keywords) || '-'} · Priority: {faq.priority}
                            </p>
                          </div>

                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => editFaq(faq)}
                              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteFaq(faq.id)}
                              className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}