import { useState } from 'react'
import Sidebar from '../../components/Sidebar'

function parseCsv(text) {
  const rows = []
  let current = []
  let value = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"' && inQuotes && next === '"') {
      value += '"'
      i++
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      current.push(value)
      value = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++

      current.push(value)

      if (current.some((item) => String(item || '').trim() !== '')) {
        rows.push(current)
      }

      current = []
      value = ''
      continue
    }

    value += char
  }

  current.push(value)

  if (current.some((item) => String(item || '').trim() !== '')) {
    rows.push(current)
  }

  if (rows.length === 0) return []

  const headers = rows[0].map((item) =>
    String(item || '')
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase()
  )

  return rows.slice(1).map((row) => {
    const obj = {}

    headers.forEach((header, index) => {
      obj[header] = String(row[index] || '').trim()
    })

    return obj
  })
}

function cleanFormulaPhone(value) {
  return String(value || '')
    .trim()
    .replace(/^="/, '')
    .replace(/"$/, '')
    .replace(/^'/, '')
}

export default function ImportBlastPage() {
  const [databaseName, setDatabaseName] = useState('')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleFileChange(e) {
    const file = e.target.files?.[0]

    setRows([])
    setMessage('')
    setError('')

    if (!file) return

    setFileName(file.name)

    const text = await file.text()
    const parsed = parseCsv(text)

    const normalized = parsed.map((row) => ({
      name: row.name || row.nama || row.customer_name || '',
      phone: cleanFormulaPhone(row.phone || row.nomor || row.no_hp || row.whatsapp || row.wa || ''),
      message: row.message || row.pesan || row.text || row.body || '',
      attachment_url: row.attachment_url || row.file_url || row.document_url || row.image_url || row.media_url || row.link_file || '',
      attachment_type: row.attachment_type || row.file_type || row.media_type || '',
      attachment_filename: row.attachment_filename || row.filename || row.file_name || row.nama_file || '',
      attachment_caption: row.attachment_caption || row.caption || row.file_caption || ''
    }))

    setRows(normalized)
  }

  async function handleImport(e) {
    e.preventDefault()

    setLoading(true)
    setMessage('')
    setError('')

    try {
      if (!databaseName.trim()) {
        throw new Error('Nama database wajib diisi')
      }

      if (rows.length === 0) {
        throw new Error('File CSV belum dipilih atau kosong')
      }

      const response = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          databaseName: databaseName.trim(),
          type: 'blast',
          contacts: rows
        })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Import blast gagal')
      }

      setMessage(
        `Import berhasil: ${data.imported || data.total || rows.length} kontak. Attachment: ${data.with_attachment || 0}.`
      )
      setRows([])
      setFileName('')
    } catch (err) {
      setError(err.message || 'Import blast gagal')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <Sidebar />

      <main className="flex-1 p-4 lg:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            Import Database WhatsApp Blast
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Upload CSV berisi kontak untuk WhatsApp Blast.
          </p>
        </div>

        <form
          onSubmit={handleImport}
          className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6"
        >
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Nama Database
              </label>
              <input
                value={databaseName}
                onChange={(e) => setDatabaseName(e.target.value)}
                placeholder="Contoh: Blast Promo MCU Juni"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-600"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                File CSV
              </label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-600"
              />
              {fileName ? (
                <p className="mt-2 text-xs text-slate-500">
                  File: {fileName}
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-700">Format kolom CSV:</p>
              <code className="mt-2 block whitespace-pre-wrap text-xs">
                name, phone, message, attachment_url, attachment_type, attachment_filename, attachment_caption
              </code>
              <p className="mt-2 text-xs">
                attachment_type isi: <b>document</b> atau <b>image</b>.
              </p>
            </div>

            {rows.length > 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-700">
                  Preview: {rows.length} baris
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Dengan attachment: {rows.filter((row) => row.attachment_url).length} baris
                </p>

                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-[900px] text-left text-xs">
                    <thead>
                      <tr className="border-b text-slate-500">
                        <th className="py-2 pr-4">Name</th>
                        <th className="py-2 pr-4">Phone</th>
                        <th className="py-2 pr-4">Attachment URL</th>
                        <th className="py-2 pr-4">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 5).map((row, index) => (
                        <tr key={index} className="border-b">
                          <td className="py-2 pr-4">{row.name}</td>
                          <td className="py-2 pr-4">{row.phone}</td>
                          <td className="max-w-xs truncate py-2 pr-4">{row.attachment_url || '-'}</td>
                          <td className="py-2 pr-4">{row.attachment_type || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
            >
              {loading ? 'Importing...' : 'Import Blast'}
            </button>

            {message ? (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                {message}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            ) : null}
          </div>
        </form>
      </main>
    </div>
  )
}