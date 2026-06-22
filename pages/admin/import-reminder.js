import { useMemo, useRef, useState } from 'react'
import Sidebar from '../../components/Sidebar'

const IMPORT_CHUNK_SIZE = 25

function cleanText(value) {
  return String(value || '').trim()
}

function cleanPhone(value) {
  let phone = String(value || '').trim()

  if (phone.startsWith('="')) phone = phone.slice(2)
  if (phone.endsWith('"')) phone = phone.slice(0, -1)
  if (phone.startsWith("'")) phone = phone.slice(1)

  let result = ''

  for (const char of phone) {
    if ('0123456789'.includes(char)) result += char
  }

  if (result.startsWith('0')) result = '62' + result.slice(1)

  return result
}

function normalizeHeader(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
}

function parseCsvLine(line) {
  const result = []
  let current = ''
  let insideQuote = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"' && insideQuote && nextChar === '"') {
      current += '"'
      i += 1
      continue
    }

    if (char === '"') {
      insideQuote = !insideQuote
      continue
    }

    if (char === ',' && !insideQuote) {
      result.push(current)
      current = ''
      continue
    }

    current += char
  }

  result.push(current)

  return result
}

function parseCsv(text) {
  const safeText = String(text || '').replace(/^\uFEFF/, '')
  const lines = safeText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) return []

  const headers = parseCsvLine(lines[0]).map(normalizeHeader)
  const rows = []

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i])
    const row = {}

    headers.forEach((header, index) => {
      row[header] = cleanText(values[index])
    })

    const hasValue = Object.values(row).some((value) => cleanText(value))

    if (hasValue) rows.push(row)
  }

  return rows
}

function excelSerialToDate(serialText) {
  const serial = Number(serialText)
  if (!Number.isFinite(serial)) return ''

  const utcDays = Math.floor(serial - 25569)
  const utcValue = utcDays * 86400
  const dateInfo = new Date(utcValue * 1000)

  if (Number.isNaN(dateInfo.getTime())) return ''

  const year = dateInfo.getUTCFullYear()
  const month = String(dateInfo.getUTCMonth() + 1).padStart(2, '0')
  const day = String(dateInfo.getUTCDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function normalizeDate(value) {
  let text = cleanText(value)

  if (!text) return ''

  if (text.startsWith('="')) text = text.slice(2)
  if (text.endsWith('"')) text = text.slice(0, -1)
  if (text.startsWith("'")) text = text.slice(1)

  text = text.split(' ')[0].trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text

  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(text)) {
    const parts = text.split('/')
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
  }

  if (/^\d{5}$/.test(text)) return excelSerialToDate(text)

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)

  if (slashMatch) {
    const first = Number(slashMatch[1])
    const second = Number(slashMatch[2])
    const year = slashMatch[3]

    let day = first
    let month = second

    if (second > 12) {
      month = first
      day = second
    }

    if (first > 12) {
      day = first
      month = second
    }

    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  const dashMatch = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)

  if (dashMatch) {
    const first = Number(dashMatch[1])
    const second = Number(dashMatch[2])
    const year = dashMatch[3]

    let day = first
    let month = second

    if (second > 12) {
      month = first
      day = second
    }

    if (first > 12) {
      day = first
      month = second
    }

    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  return text
}

function normalizeTime(value) {
  let text = cleanText(value)

  if (!text) return '09:00'

  if (text.startsWith('="')) text = text.slice(2)
  if (text.endsWith('"')) text = text.slice(0, -1)
  if (text.startsWith("'")) text = text.slice(1)

  text = text.trim()

  const decimal = Number(text)

  if (Number.isFinite(decimal) && decimal > 0 && decimal < 1) {
    const totalMinutes = Math.round(decimal * 24 * 60)
    const hour = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
    const minute = String(totalMinutes % 60).padStart(2, '0')
    return `${hour}:${minute}`
  }

  const ampmMatch = text.match(/^(\d{1,2}):?(\d{2})?\s*(AM|PM)$/i)

  if (ampmMatch) {
    let hour = Number(ampmMatch[1])
    const minute = String(ampmMatch[2] || '00').padStart(2, '0')
    const marker = ampmMatch[3].toUpperCase()

    if (marker === 'PM' && hour < 12) hour += 12
    if (marker === 'AM' && hour === 12) hour = 0

    return `${String(hour).padStart(2, '0')}:${minute}`
  }

  const match = text.match(/^(\d{1,2})(?::(\d{1,2}))?$/)

  if (!match) return text

  const hour = match[1].padStart(2, '0')
  const minute = String(match[2] || '00').padStart(2, '0')

  return `${hour}:${minute}`
}

function normalizeReminderRows(rows, defaultAttachment) {
  return rows
    .filter((row) => Object.values(row || {}).some((value) => cleanText(value)))
    .map((row) => {
      const name = cleanText(row.name || row.nama || row.customer_name || row.patient_name)
      const phone = cleanPhone(row.phone || row.no_hp || row.nomor || row.whatsapp || row.wa)
      const message = cleanText(row.message || row.pesan || row.template || row.text)
      const reminderDate = normalizeDate(row.reminder_date || row.tanggal || row.date || row.jadwal_tanggal)
      const reminderTime = normalizeTime(row.reminder_time || row.jam || row.time || row.jadwal_jam)

      const rowAttachmentUrl = cleanText(row.attachment_url || row.file_url || row.url)
      const attachmentUrl = rowAttachmentUrl || cleanText(defaultAttachment.attachment_url)

      return {
        type: 'reminder',
        name,
        phone,
        message,
        reminder_date: reminderDate,
        reminder_time: reminderTime,
        attachment_url: attachmentUrl,
        attachment_type: cleanText(row.attachment_type) || cleanText(defaultAttachment.attachment_type) || '',
        attachment_filename: cleanText(row.attachment_filename) || cleanText(defaultAttachment.attachment_filename) || '',
        attachment_caption: cleanText(row.attachment_caption) || cleanText(defaultAttachment.attachment_caption) || ''
      }
    })
}

function validateRows(rows) {
  const errors = []

  rows.forEach((row, index) => {
    const rowNumber = index + 2

    if (!row.name) errors.push(`Baris ${rowNumber}: name kosong.`)
    if (!row.phone) errors.push(`Baris ${rowNumber}: phone kosong / tidak valid.`)
    if (!row.message) errors.push(`Baris ${rowNumber}: message kosong.`)
    if (!row.reminder_date) errors.push(`Baris ${rowNumber}: reminder_date kosong.`)

    if (row.reminder_date && !/^\d{4}-\d{2}-\d{2}$/.test(row.reminder_date)) {
      errors.push(`Baris ${rowNumber}: reminder_date tidak valid. Gunakan YYYY-MM-DD, contoh 2026-06-25.`)
    }

    if (row.reminder_time && !/^\d{2}:\d{2}$/.test(row.reminder_time)) {
      errors.push(`Baris ${rowNumber}: reminder_time tidak valid. Gunakan HH:mm, contoh 09:00.`)
    }
  })

  return errors
}

function downloadCsv(filename, rows) {
  const blob = new Blob([rows.join('\n')], {
    type: 'text/csv;charset=utf-8;'
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.click()

  URL.revokeObjectURL(url)
}

function guessAttachmentType(url) {
  const lower = cleanText(url).toLowerCase()

  if (!lower) return ''
  if (lower.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/)) return 'image'
  if (lower.match(/\.(pdf|doc|docx|xls|xlsx|csv|txt)(\?|$)/)) return 'document'

  return 'document'
}

function guessFilename(url) {
  try {
    const parsed = new URL(url)
    const parts = parsed.pathname.split('/')
    const last = parts[parts.length - 1]
    return decodeURIComponent(last || 'attachment')
  } catch (err) {
    const parts = cleanText(url).split('/')
    return parts[parts.length - 1] || 'attachment'
  }
}

async function readJsonResponse(response) {
  const text = await response.text()

  try {
    return JSON.parse(text)
  } catch (err) {
    return {
      success: false,
      message: text || 'Invalid response'
    }
  }
}

function extractDatabaseId(data) {
  return (
    data?.database?.id ||
    data?.data?.id ||
    data?.item?.id ||
    data?.result?.id ||
    data?.id ||
    data?.database_id ||
    data?.databaseId ||
    ''
  )
}

function selectedTypesFromState(scheduleTypes) {
  const selected = []

  if (scheduleTypes.h3) selected.push('H-3')
  if (scheduleTypes.h1) selected.push('H-1')
  if (scheduleTypes.h7jam) selected.push('H-7JAM')

  return selected
}

export default function ImportReminderPage() {
  const fileRef = useRef(null)

  const [databaseName, setDatabaseName] = useState('')
  const [fileName, setFileName] = useState('')
  const [rawRows, setRawRows] = useState([])
  const [parsedRows, setParsedRows] = useState([])
  const [defaultAttachment, setDefaultAttachment] = useState({
    attachment_url: '',
    attachment_type: '',
    attachment_filename: '',
    attachment_caption: ''
  })
  const [showAttachmentBox, setShowAttachmentBox] = useState(false)
  const [scheduleTypes, setScheduleTypes] = useState({
    h3: true,
    h1: true,
    h7jam: true
  })
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const selectedScheduleTypes = useMemo(() => selectedTypesFromState(scheduleTypes), [scheduleTypes])

  function handleDownloadTemplateBasic() {
    downloadCsv('template_reminder_tanpa_attachment.csv', [
      'name,phone,message,reminder_date,reminder_time',
      'Susi Salwa,628568032191,"Halo Susi, ini reminder jadwal vaksin besok ya.",2026-06-25,09:00',
      'Budi,6281234567890,"Halo Budi, jangan lupa jadwal MCU ya.",2026-06-26,13:30'
    ])
  }

  function handleDownloadTemplateAttachment() {
    downloadCsv('template_reminder_dengan_attachment.csv', [
      'name,phone,message,reminder_date,reminder_time,attachment_url,attachment_type,attachment_filename,attachment_caption',
      'Susi Salwa,628568032191,"Halo Susi, ini reminder jadwal vaksin besok ya.",2026-06-25,09:00,https://example.com/file.pdf,document,file.pdf,"Detail jadwal vaksin"',
      'Budi,6281234567890,"Halo Budi, jangan lupa jadwal MCU ya.",2026-06-26,13:30,,,,'
    ])
  }

  function handleDownloadTemplateDateTime() {
    downloadCsv('template_reminder_tanggal_jam.csv', [
      'name,phone,message,reminder_date,reminder_time',
      'Susi Salwa,628568032191,"Halo Susi, jadwal vaksin kamu tanggal 25 Juni jam 09:00.",2026-06-25,09:00',
      'Budi,6281234567890,"Halo Budi, jadwal MCU kamu tanggal 26 Juni jam 13:30.",2026-06-26,13:30'
    ])
  }

  function toggleSchedule(key) {
    setScheduleTypes((prev) => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0]

    setError('')
    setSuccess('')
    setRawRows([])
    setParsedRows([])
    setFileName('')

    if (!file) return

    setFileName(file.name)

    const text = await file.text()
    const rows = parseCsv(text)
    const normalized = normalizeReminderRows(rows, defaultAttachment)

    setRawRows(rows)
    setParsedRows(normalized)
  }

  function applyAttachment() {
    setError('')

    const url = cleanText(defaultAttachment.attachment_url)

    if (!url) {
      setDefaultAttachment({
        attachment_url: '',
        attachment_type: '',
        attachment_filename: '',
        attachment_caption: ''
      })
      setShowAttachmentBox(false)
      return
    }

    try {
      new URL(url)
    } catch (err) {
      setError('Attachment URL tidak valid.')
      return
    }

    const updated = {
      ...defaultAttachment,
      attachment_url: url,
      attachment_type: cleanText(defaultAttachment.attachment_type) || guessAttachmentType(url),
      attachment_filename: cleanText(defaultAttachment.attachment_filename) || guessFilename(url)
    }

    setDefaultAttachment(updated)
    setParsedRows(normalizeReminderRows(rawRows, updated))
    setShowAttachmentBox(false)
  }

  async function createDatabase() {
    const response = await fetch('/api/contacts/create-import-database', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: databaseName,
        database_name: databaseName,
        databaseName,
        type: 'reminder',
        default_attachment_url: cleanText(defaultAttachment.attachment_url) || null,
        default_attachment_type: cleanText(defaultAttachment.attachment_type) || null,
        default_attachment_filename: cleanText(defaultAttachment.attachment_filename) || null,
        default_attachment_caption: cleanText(defaultAttachment.attachment_caption) || null
      })
    })

    const data = await readJsonResponse(response)

    if (!response.ok || data.success === false) {
      throw new Error(data.message || 'Gagal membuat database reminder.')
    }

    const databaseId = extractDatabaseId(data)

    if (!databaseId) {
      throw new Error('Database berhasil dibuat tapi ID database tidak ditemukan dari response API.')
    }

    return databaseId
  }

  async function importContacts(databaseId, rows) {
    for (let i = 0; i < rows.length; i += IMPORT_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + IMPORT_CHUNK_SIZE)
      const current = Math.min(i + IMPORT_CHUNK_SIZE, rows.length)

      setProgress(`Import kontak ${current}/${rows.length}...`)

      const response = await fetch('/api/contacts/import-chunk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          database_id: databaseId,
          databaseId,
          type: 'reminder',
          rows: chunk,
          contacts: chunk
        })
      })

      const data = await readJsonResponse(response)

      if (!response.ok || data.success === false) {
        throw new Error(data.message || `Gagal import chunk kontak ${current}.`)
      }
    }
  }

  async function generateSchedules(databaseId) {
    setProgress('Membuat jadwal reminder otomatis...')

    const response = await fetch('/api/reminder-schedules/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        database_id: databaseId,
        schedule_types: selectedScheduleTypes
      })
    })

    const data = await readJsonResponse(response)

    if (!response.ok || data.success === false) {
      throw new Error(data.message || 'Gagal membuat jadwal reminder.')
    }

    return data
  }

  async function handleImport() {
    setLoading(true)
    setError('')
    setSuccess('')
    setProgress('')

    try {
      if (!cleanText(databaseName)) throw new Error('Nama database wajib diisi.')
      if (!parsedRows.length) throw new Error('File CSV belum dipilih atau kosong.')
      if (!selectedScheduleTypes.length) throw new Error('Pilih minimal 1 jadwal reminder: H-3, H-1, atau H-7 Jam.')

      const validationErrors = validateRows(parsedRows)

      if (validationErrors.length) {
        throw new Error(validationErrors.slice(0, 8).join('\n'))
      }

      setProgress('Membuat database reminder...')
      const databaseId = await createDatabase()

      await importContacts(databaseId, parsedRows)

      const scheduleData = await generateSchedules(databaseId)

      setSuccess(
        `Import berhasil. ${parsedRows.length} kontak masuk. Jadwal dibuat/tersedia: ${
          scheduleData.schedules_created_or_existing || 0
        }. Silakan buka Job Queue lalu klik Create Job.`
      )
      setProgress('Selesai.')
    } catch (err) {
      setError(err.message || 'Import reminder gagal.')
      setProgress('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      <Sidebar />

      <main className="flex-1 p-4 lg:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-900 lg:text-3xl">
                Import Database Reminder
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Upload CSV berisi kontak reminder pasien/customer.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleDownloadTemplateBasic} className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200">
                Download Template Tanpa Attachment
              </button>

              <button type="button" onClick={handleDownloadTemplateAttachment} className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-sm">
                Download Template Dengan Attachment
              </button>

              <button type="button" onClick={handleDownloadTemplateDateTime} className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm">
                Download Template Tanggal + Jam
              </button>
            </div>
          </div>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-7">
            {error ? (
              <div className="mb-5 whitespace-pre-line rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                {success}
              </div>
            ) : null}

            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-black text-slate-900">
                  Nama Database
                </label>
                <input
                  type="text"
                  value={databaseName}
                  onChange={(event) => setDatabaseName(event.target.value)}
                  placeholder="Contoh: Reminder MCU Juni"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-4 text-sm outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-black text-slate-900">
                  File CSV
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-4 text-sm"
                />

                {fileName ? (
                  <p className="mt-2 text-xs text-slate-500">
                    File: {fileName} — {parsedRows.length} baris terbaca.
                  </p>
                ) : null}
              </div>

              <div className="rounded-3xl border border-indigo-100 bg-indigo-50 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-black text-slate-900">
                      Attachment untuk semua kontak
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Gunakan URL file agar import tetap ringan dan tidak hang.
                    </p>

                    {defaultAttachment.attachment_url ? (
                      <p className="mt-2 break-all text-xs text-indigo-700">
                        {defaultAttachment.attachment_url}
                      </p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAttachmentBox(!showAttachmentBox)}
                    className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white"
                  >
                    Attach File / URL
                  </button>
                </div>

                {showAttachmentBox ? (
                  <div className="mt-5 grid gap-3 lg:grid-cols-4">
                    <input
                      type="url"
                      value={defaultAttachment.attachment_url}
                      onChange={(event) => setDefaultAttachment({ ...defaultAttachment, attachment_url: event.target.value })}
                      placeholder="Attachment URL"
                      className="rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none lg:col-span-2"
                    />

                    <select
                      value={defaultAttachment.attachment_type}
                      onChange={(event) => setDefaultAttachment({ ...defaultAttachment, attachment_type: event.target.value })}
                      className="rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none"
                    >
                      <option value="">Auto</option>
                      <option value="image">Image</option>
                      <option value="document">Document</option>
                    </select>

                    <button type="button" onClick={applyAttachment} className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white">
                      Simpan Attachment
                    </button>

                    <input
                      type="text"
                      value={defaultAttachment.attachment_filename}
                      onChange={(event) => setDefaultAttachment({ ...defaultAttachment, attachment_filename: event.target.value })}
                      placeholder="Filename optional"
                      className="rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none lg:col-span-2"
                    />

                    <input
                      type="text"
                      value={defaultAttachment.attachment_caption}
                      onChange={(event) => setDefaultAttachment({ ...defaultAttachment, attachment_caption: event.target.value })}
                      placeholder="Caption optional"
                      className="rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none lg:col-span-2"
                    />
                  </div>
                ) : null}
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="font-black text-slate-900">
                  Jadwal Reminder Otomatis
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Pilih kapan reminder dikirim sebelum jadwal utama pada CSV.
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <input type="checkbox" checked={scheduleTypes.h3} onChange={() => toggleSchedule('h3')} />
                    <div>
                      <p className="font-bold text-slate-900">Reminder H-3</p>
                      <p className="text-xs text-slate-500">Kirim 3 hari sebelum jadwal</p>
                    </div>
                  </label>

                  <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <input type="checkbox" checked={scheduleTypes.h1} onChange={() => toggleSchedule('h1')} />
                    <div>
                      <p className="font-bold text-slate-900">Reminder H-1</p>
                      <p className="text-xs text-slate-500">Kirim 1 hari sebelum jadwal</p>
                    </div>
                  </label>

                  <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <input type="checkbox" checked={scheduleTypes.h7jam} onChange={() => toggleSchedule('h7jam')} />
                    <div>
                      <p className="font-bold text-slate-900">Reminder H-7 Jam</p>
                      <p className="text-xs text-slate-500">Kirim 7 jam sebelum jadwal</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="rounded-3xl bg-slate-50 p-5">
                <p className="font-black text-slate-900">Format kolom CSV:</p>
                <p className="mt-3 font-mono text-xs text-slate-700">
                  name, phone, message, reminder_date, reminder_time, attachment_url, attachment_type, attachment_filename, attachment_caption
                </p>
                <p className="mt-3 text-sm text-slate-500">
                  Format aman reminder_date: YYYY-MM-DD, contoh 2026-06-25. Excel format 6/25/2026 juga akan dibaca otomatis. Baris kosong akan otomatis dilewati.
                </p>
              </div>

              {progress ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
                  {progress}
                </div>
              ) : null}

              <button
                type="button"
                onClick={handleImport}
                disabled={loading}
                className="rounded-2xl bg-indigo-600 px-6 py-4 text-sm font-black text-white shadow-sm hover:bg-indigo-700 disabled:bg-slate-300"
              >
                {loading ? 'Importing...' : 'Import Reminder'}
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}