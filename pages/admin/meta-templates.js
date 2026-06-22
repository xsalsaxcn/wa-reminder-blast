import { useEffect, useMemo, useState } from 'react'

function cleanText(value) {
  return String(value || '').trim()
}

function sanitizeTemplateName(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function countBodyVariables(text) {
  const matches = Array.from(String(text || '').matchAll(/{{\s*(\d+)\s*}}/g))
  const numbers = matches
    .map((match) => Number(match[1]))
    .filter((num) => Number.isFinite(num))

  if (!numbers.length) return 0

  return Math.max(...numbers)
}

function badgeClass(status) {
  const text = cleanText(status).toUpperCase()

  if (text === 'APPROVED') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (text === 'PENDING') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (text === 'REJECTED') return 'bg-rose-50 text-rose-700 border-rose-200'
  if (text === 'FAILED') return 'bg-rose-50 text-rose-700 border-rose-200'

  return 'bg-slate-50 text-slate-700 border-slate-200'
}

function shortText(value, max = 80) {
  const text = cleanText(value)

  if (text.length <= max) return text

  return text.slice(0, max) + '...'
}

export default function MetaTemplatesPage() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [detail, setDetail] = useState(null)

  const [form, setForm] = useState({
    name: '',
    category: 'MARKETING',
    language: 'id',
    header_type: 'NONE',
    sample_url: '',
    sample_filename: '',
    sample_mime_type: '',
    body: 'Halo {{1}}, informasi dari inHarmony Clinic.',
    body_examples: 'Kak Susi',
    footer: ''
  })

  const variableCount = useMemo(() => {
    return countBodyVariables(form.body)
  }, [form.body])

  const sanitizedName = useMemo(() => {
    return sanitizeTemplateName(form.name)
  }, [form.name])

  function updateForm(key, value) {
    setForm((prev) => ({
      ...prev,
      [key]: value
    }))
  }

  async function readResponse(response) {
    const text = await response.text()

    try {
      return JSON.parse(text)
    } catch (error) {
      return {
        success: response.ok,
        raw: text
      }
    }
  }

  async function loadTemplates(sync = true) {
    setLoading(true)
    setMessage('')

    try {
      const response = await fetch(`/api/meta/templates/list?sync=${sync ? '1' : '0'}`)
      const data = await readResponse(response)

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal memuat templates.')
      }

      setTemplates(data.templates || data.rows || [])
      setDetail(data)
      setMessage(sync ? 'Template berhasil disync dari Meta.' : 'Template lokal berhasil dimuat.')
    } catch (error) {
      setMessage(error.message || 'Gagal memuat templates.')
    } finally {
      setLoading(false)
    }
  }

  async function submitTemplate(event) {
    event.preventDefault()

    setSubmitting(true)
    setMessage('')
    setDetail(null)

    try {
      const payload = {
        ...form,
        name: sanitizedName || form.name
      }

      const response = await fetch('/api/meta/templates/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      const data = await readResponse(response)

      setDetail(data)

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal submit template ke Meta.')
      }

      setMessage('Template berhasil dikirim ke Meta. Status awal biasanya PENDING.')
      await loadTemplates(true)
    } catch (error) {
      setMessage(error.message || 'Gagal submit template ke Meta.')
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    loadTemplates(true)
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-6 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-600">
                WhatsApp Business API
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight">
                Meta Templates
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Buat dan cek approval template WhatsApp langsung dari Notiva.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => loadTemplates(false)}
                disabled={loading}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Load Local
              </button>

              <button
                type="button"
                onClick={() => loadTemplates(true)}
                disabled={loading}
                className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {loading ? 'Syncing...' : 'Sync from Meta'}
              </button>
            </div>
          </div>
        </div>

        {message ? (
          <div className="rounded-2xl border border-cyan-100 bg-cyan-50 px-5 py-4 text-sm font-semibold text-cyan-800">
            {message}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <form
            onSubmit={submitTemplate}
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h2 className="text-lg font-black">Create Template</h2>
            <p className="mt-1 text-sm text-slate-500">
              Untuk blast ke kontak di luar 24 jam, gunakan template approved.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Template Name
                </label>
                <input
                  value={form.name}
                  onChange={(event) => updateForm('name', event.target.value)}
                  placeholder="omni_mcu_brochure_2026"
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-400"
                />
                {sanitizedName ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Nama yang dikirim ke Meta: <b>{sanitizedName}</b>
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Category
                  </label>
                  <select
                    value={form.category}
                    onChange={(event) => updateForm('category', event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-400"
                  >
                    <option value="MARKETING">MARKETING</option>
                    <option value="UTILITY">UTILITY</option>
                    <option value="AUTHENTICATION">AUTHENTICATION</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Language
                  </label>
                  <input
                    value={form.language}
                    onChange={(event) => updateForm('language', event.target.value)}
                    placeholder="id"
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Header Attachment
                </label>
                <select
                  value={form.header_type}
                  onChange={(event) => updateForm('header_type', event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-400"
                >
                  <option value="NONE">None</option>
                  <option value="IMAGE">Image</option>
                  <option value="DOCUMENT">Document</option>
                  <option value="VIDEO">Video</option>
                </select>
              </div>

              {form.header_type !== 'NONE' ? (
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                  <p className="text-sm font-bold text-amber-900">
                    Sample attachment wajib public URL.
                  </p>
                  <p className="mt-1 text-xs text-amber-700">
                    File ini hanya untuk contoh review template Meta. Saat blast, file per kontak bisa diganti dengan attachment_url.
                  </p>

                  <div className="mt-4 space-y-3">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide text-amber-800">
                        Sample URL
                      </label>
                      <input
                        value={form.sample_url}
                        onChange={(event) => updateForm('sample_url', event.target.value)}
                        placeholder="https://domain.com/brosur.pdf"
                        className="mt-2 w-full rounded-2xl border border-amber-200 px-4 py-3 text-sm outline-none focus:border-amber-400"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold uppercase tracking-wide text-amber-800">
                          Filename
                        </label>
                        <input
                          value={form.sample_filename}
                          onChange={(event) => updateForm('sample_filename', event.target.value)}
                          placeholder="brosur.pdf"
                          className="mt-2 w-full rounded-2xl border border-amber-200 px-4 py-3 text-sm outline-none focus:border-amber-400"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold uppercase tracking-wide text-amber-800">
                          MIME Type
                        </label>
                        <input
                          value={form.sample_mime_type}
                          onChange={(event) => updateForm('sample_mime_type', event.target.value)}
                          placeholder={
                            form.header_type === 'IMAGE'
                              ? 'image/jpeg'
                              : form.header_type === 'VIDEO'
                                ? 'video/mp4'
                                : 'application/pdf'
                          }
                          className="mt-2 w-full rounded-2xl border border-amber-200 px-4 py-3 text-sm outline-none focus:border-amber-400"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Body
                </label>
                <textarea
                  value={form.body}
                  onChange={(event) => updateForm('body', event.target.value)}
                  rows={6}
                  placeholder="Halo {{1}}, informasi dari inHarmony Clinic."
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-400"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Variable terdeteksi: {variableCount}. Gunakan format {'{{1}}'}, {'{{2}}'}.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Body Example Values
                </label>
                <input
                  value={form.body_examples}
                  onChange={(event) => updateForm('body_examples', event.target.value)}
                  placeholder="Kak Susi | 25 Juni 2026"
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-400"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Pisahkan contoh variable dengan tanda pipe: |
                </p>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Footer Optional
                </label>
                <input
                  value={form.footer}
                  onChange={(event) => updateForm('footer', event.target.value)}
                  placeholder="inHarmony Clinic"
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-400"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-cyan-200 hover:opacity-95 disabled:opacity-60"
              >
                {submitting ? 'Submitting...' : 'Submit Template to Meta'}
              </button>
            </div>
          </form>

          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black">Template List</h2>
              <p className="mt-1 text-sm text-slate-500">
                Klik Sync from Meta untuk update status approval.
              </p>

              <div className="mt-5 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-3">Name</th>
                      <th className="px-3 py-3">Header</th>
                      <th className="px-3 py-3">Category</th>
                      <th className="px-3 py-3">Lang</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Body</th>
                      <th className="px-3 py-3">Reason</th>
                    </tr>
                  </thead>

                  <tbody>
                    {templates.map((template) => (
                      <tr key={template.id || `${template.name}-${template.language}`} className="border-b border-slate-50">
                        <td className="px-3 py-4 font-bold text-slate-900">
                          {template.name}
                          {template.meta_template_id ? (
                            <div className="mt-1 text-xs font-normal text-slate-400">
                              {template.meta_template_id}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-4">
                          {template.header_type || 'NONE'}
                        </td>
                        <td className="px-3 py-4">
                          {template.category}
                        </td>
                        <td className="px-3 py-4">
                          {template.language}
                        </td>
                        <td className="px-3 py-4">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${badgeClass(template.status)}`}>
                            {template.status || '-'}
                          </span>
                        </td>
                        <td className="max-w-xs px-3 py-4 text-slate-600">
                          {shortText(template.body, 120)}
                        </td>
                        <td className="max-w-xs px-3 py-4 text-rose-600">
                          {shortText(template.rejected_reason, 120) || '-'}
                        </td>
                      </tr>
                    ))}

                    {!templates.length ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                          Belum ada template.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <details className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
              <summary className="cursor-pointer text-sm font-black">
                Detail response terakhir
              </summary>
              <pre className="mt-4 max-h-96 overflow-auto rounded-2xl bg-black p-4 text-xs text-cyan-50">
                {JSON.stringify(detail, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      </div>
    </div>
  )
}