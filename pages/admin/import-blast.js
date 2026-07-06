import { useRef, useState } from 'react'
import Sidebar from '../../components/Sidebar'
import {
  downloadCsvFile,
  fetchWithTimeout,
  parseCsv,
  readApiResponse,
  wait
} from '../../lib/importClientUtils'

const MAX_ROWS = 5000
const IMPORT_CHUNK_SIZE_SAFE = 25

function cleanText(value) {
  return String(value || '').trim()
}

function getValue(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      return cleanText(row[key])
    }

    const foundKey = Object.keys(row || {}).find(
      (item) => cleanText(item).toLowerCase() === cleanText(key).toLowerCase()
    )

    if (foundKey) {
      return cleanText(row[foundKey])
    }
  }

  return ''
}

function normalizePhone(value) {
  let phone = cleanText(value)
  let result = ''

  if (phone.startsWith('="')) phone = phone.slice(2)
  if (phone.endsWith('"')) phone = phone.slice(0, -1)
  if (phone.startsWith("'")) phone = phone.slice(1)

  for (const char of phone) {
    if ('0123456789'.includes(char)) result += char
  }

  if (result.startsWith('0')) result = '62' + result.slice(1)

  return result
}

function parseTemplateParams(row) {
  const params = []

  function addParam(value) {
    const text = cleanText(value)
    if (text) params.push(text)
  }

  function addDirectParams(value) {
    if (!value) return

    if (Array.isArray(value)) {
      value.forEach(addParam)
      return
    }

    const text = cleanText(value)
    if (!text) return

    try {
      const parsed = JSON.parse(text)

      if (Array.isArray(parsed)) {
        parsed.forEach(addParam)
        return
      }
    } catch (error) {
      // lanjut pakai separator pipe
    }

    text.split('|').forEach(addParam)
  }

  addDirectParams(
    row.template_params ||
      row.templateParams ||
      row.params ||
      row.body_params ||
      row.bodyParams
  )

  for (let i = 1; i <= 20; i += 1) {
    const value =
      row[`param_${i}`] ||
      row[`parameter_${i}`] ||
      row[`template_param_${i}`] ||
      row[`body_param_${i}`]

    addParam(value)
  }

  return params
}

function normalizeBlastRowsAllowTemplate(rows) {
  const normalized = []

  for (const row of rows || []) {
    const name = getValue(row, ['name', 'nama', 'customer_name', 'patient_name'])
    const phone = normalizePhone(
      getValue(row, ['phone', 'no_hp', 'nomor', 'whatsapp', 'wa'])
    )

    const message = getValue(row, ['message', 'pesan', 'template', 'text'])

    const attachmentUrl = getValue(row, [
      'attachment_url',
      'file_url',
      'url'
    ])

    const attachmentType = getValue(row, [
      'attachment_type',
      'file_type',
      'type'
    ])

    const attachmentFilename = getValue(row, [
      'attachment_filename',
      'filename',
      'file_name'
    ])

    const attachmentCaption = getValue(row, [
      'attachment_caption',
      'caption'
    ])

    const templateParams = parseTemplateParams(row)

    if (!name && !phone && !message && !attachmentUrl) continue

    // Untuk Template Blast, yang wajib hanya name + phone.
    // message boleh kosong karena isi pesan diambil dari approved Meta template.
    if (!name || !phone) continue

    normalized.push({
      name,
      phone,
      message: message || '',
      template_params: templateParams.length ? templateParams : null,
      attachment_url: attachmentUrl || '',
      attachment_type: attachmentType || '',
      attachment_filename: attachmentFilename || '',
      attachment_caption: attachmentCaption || ''
    })
  }

  return normalized
}

function downloadBlastTemplateWithoutAttachment() {
  downloadCsvFile(
    'template_blast_tanpa_attachment.csv',
    ['name', 'phone'],
    [
      {
        name: 'Indira',
        phone: '="6285137908391"'
      },
      {
        name: 'Susi',
        phone: '="628568032191"'
      },
      {
        name: 'Nabila',
        phone: '="6289619852041"'
      }
    ]
  )
}

function downloadBlastTemplateWithAttachment() {
  downloadCsvFile(
    'template_blast_dengan_attachment.csv',
    [
      'name',
      'phone',
      'attachment_url',
      'attachment_type',
      'attachment_filename'
    ],
    [
      {
        name: 'Indira',
        phone: '="6285137908391"',
        attachment_url: 'https://cdn.phototourl.com/free/2026-06-22-a48b8976-8ef9-470f-9345-ab3843761ee1.jpg',
        attachment_type: 'image',
        attachment_filename: 'CV2026_Flyer.jpg'
      },
      {
        name: 'Susi',
        phone: '="628568032191"',
        attachment_url: 'https://cdn.phototourl.com/free/2026-06-22-a48b8976-8ef9-470f-9345-ab3843761ee1.jpg',
        attachment_type: 'image',
        attachment_filename: 'CV2026_Flyer.jpg'
      }
    ]
  )
}

function downloadTemplateBlastWithParams() {
  downloadCsvFile(
    'template_blast_dengan_param.csv',
    [
      'name',
      'phone',
      'param_1',
      'attachment_url',
      'attachment_type',
      'attachment_filename'
    ],
    [
      {
        name: 'Indira',
        phone: '="6285137908391"',
        param_1: 'Kak Indira',
        attachment_url: 'https://cdn.phototourl.com/free/2026-06-22-a48b8976-8ef9-470f-9345-ab3843761ee1.jpg',
        attachment_type: 'image',
        attachment_filename: 'CV2026_Flyer.jpg'
      },
      {
        name: 'Susi',
        phone: '="628568032191"',
        param_1: 'Kak Susi',
        attachment_url: 'https://cdn.phototourl.com/free/2026-06-22-a48b8976-8ef9-470f-9345-ab3843761ee1.jpg',
        attachment_type: 'image',
        attachment_filename: 'CV2026_Flyer.jpg'
      }
    ]
  )
}

function guessAttachmentType(url) {
  const text = String(url || '').toLowerCase()

  if (
    text.includes('.jpg') ||
    text.includes('.jpeg') ||
    text.includes('.png') ||
    text.includes('.webp')
  ) {
    return 'image'
  }

  if (text.includes('.mp4')) {
    return 'video'
  }

  return 'document'
}

function downloadTemplateBlastMultiParams() {
  downloadCsvFile(
    'template_blast_multi_param.csv',
    [
      'name',
      'phone',
      'param_1',
      'param_2',
      'param_3',
      'param_4',
      'param_5'
    ],
    [
      {
        name: 'Susi Salwa',
        phone: '628568032191',
        param_1: 'Susi Salwa',
        param_2: 'Suntikan ke-2',
        param_3: '31 Juli 2026',
        param_4: '10.00 WIB',
        param_5: 'inHARMONY Clinic'
      },
      {
        name: 'Budi Santoso',
        phone: '6285137908391',
        param_1: 'Budi Santoso',
        param_2: 'Suntikan ke-2',
        param_3: '1 Agustus 2026',
        param_4: '14.00 WIB',
        param_5: 'inHARMONY Clinic'
      }
    ]
  )
}

function downloadReminderMultiParams() {
  downloadCsvFile(
    'template_reminder_multi_param.csv',
    [
      'name',
      'phone',
      'param_1',
      'param_2',
      'param_3',
      'param_4',
      'param_5'
    ],
    [
      {
        name: 'Susi Salwa',
        phone: '628568032191',
        param_1: 'Susi Salwa',
        param_2: 'Suntikan ke-2',
        param_3: '31 Juli 2026',
        param_4: '10.00 WIB',
        param_5: 'inHARMONY Clinic'
      },
      {
        name: 'Budi Santoso',
        phone: '6285137908391',
        param_1: 'Budi Santoso',
        param_2: 'Suntikan ke-2',
        param_3: '1 Agustus 2026',
        param_4: '14.00 WIB',
        param_5: 'inHARMONY Clinic'
      }
    ]
  )
}

function downloadReminderMultiParamsWithAttachment() {
  downloadCsvFile(
    'template_reminder_multi_param_attachment.csv',
    [
      'name',
      'phone',
      'param_1',
      'param_2',
      'param_3',
      'param_4',
      'param_5',
      'attachment_url',
      'attachment_type',
      'attachment_filename'
    ],
    [
      {
        name: 'Susi Salwa',
        phone: '628568032191',
        param_1: 'Susi Salwa',
        param_2: 'Suntikan ke-2',
        param_3: '31 Juli 2026',
        param_4: '10.00 WIB',
        param_5: 'inHARMONY Clinic',
        attachment_url: 'https://example.com/reminder.jpg',
        attachment_type: 'image',
        attachment_filename: 'Reminder.jpg'
      },
      {
        name: 'Budi Santoso',
        phone: '6285137908391',
        param_1: 'Budi Santoso',
        param_2: 'Suntikan ke-2',
        param_3: '1 Agustus 2026',
        param_4: '14.00 WIB',
        param_5: 'inHARMONY Clinic',
        attachment_url: 'https://example.com/reminder.jpg',
        attachment_type: 'image',
        attachment_filename: 'Reminder.jpg'
      }
    ]
  )
}

function downloadTemplateParamsPipe() {
  downloadCsvFile(
    'template_params_pipe.csv',
    [
      'name',
      'phone',
      'template_params'
    ],
    [
      {
        name: 'Susi Salwa',
        phone: '628568032191',
        template_params: 'Susi Salwa|Suntikan ke-2|31 Juli 2026|10.00 WIB|inHARMONY Clinic'
      },
      {
        name: 'Budi Santoso',
        phone: '6285137908391',
        template_params: 'Budi Santoso|Suntikan ke-2|1 Agustus 2026|14.00 WIB|inHARMONY Clinic'
      }
    ]
  )
}

function guessFileName(url) {
  try {
    const parsed = new URL(url)
    const parts = parsed.pathname.split('/')
    const last = parts[parts.length - 1]

    if (last) return decodeURIComponent(last)
  } catch (err) {
    return 'attachment'
  }

  return 'attachment'
}

function isValidUrl(value) {
  try {
    const url = new URL(value)

    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch (err) {
    return false
  }
}

function getInsertedCount(data, fallbackChunkLength) {
  if (Number.isFinite(Number(data?.inserted))) return Number(data.inserted)
  if (Number.isFinite(Number(data?.imported))) return Number(data.imported)
  if (Number.isFinite(Number(data?.count))) return Number(data.count)
  if (Array.isArray(data?.rows)) return data.rows.length
  if (Array.isArray(data?.data)) return data.data.length

  return fallbackChunkLength
}

function getSkippedCount(data) {
  if (Array.isArray(data?.skipped)) return data.skipped.length
  if (Number.isFinite(Number(data?.skipped))) return Number(data.skipped)

  return 0
}

function getAttachmentCount(data, chunk) {
  if (Number.isFinite(Number(data?.with_attachment))) return Number(data.with_attachment)
  if (Number.isFinite(Number(data?.withAttachment))) return Number(data.withAttachment)

  return chunk.filter((row) => row.attachment_url).length
}

export default function ImportBlastPage() {
  const rowsRef = useRef([])

  const [databaseName, setDatabaseName] = useState('')
  const [fileName, setFileName] = useState('')
  const [rowCount, setRowCount] = useState(0)
  const [csvAttachmentCount, setCsvAttachmentCount] = useState(0)

  const [showAttachBox, setShowAttachBox] = useState(false)
  const [attachmentUrlInput, setAttachmentUrlInput] = useState('')
  const [attachmentTypeInput, setAttachmentTypeInput] = useState('auto')
  const [attachmentCaptionInput, setAttachmentCaptionInput] = useState('')
  const [attachmentMeta, setAttachmentMeta] = useState(null)

  const [loading, setLoading] = useState(false)
  const [progressText, setProgressText] = useState('')
  const [progressPercent, setProgressPercent] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function resetCsv() {
    rowsRef.current = []
    setFileName('')
    setRowCount(0)
    setCsvAttachmentCount(0)
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]

    resetCsv()
    setMessage('')
    setError('')
    setProgressText('')
    setProgressPercent(0)

    if (!file) return

    try {
      setProgressText('Membaca CSV...')
      setProgressPercent(5)

      const text = await file.text()
      await wait(50)

      const parsed = parseCsv(text)
      const normalized = normalizeBlastRowsAllowTemplate(parsed)

      if (normalized.length > MAX_ROWS) {
        throw new Error('Maksimal import adalah ' + MAX_ROWS + ' baris. Pecah CSV menjadi beberapa file.')
      }

      rowsRef.current = normalized

      const countAttachment = normalized.filter((row) => row.attachment_url).length

      setFileName(file.name)
      setRowCount(normalized.length)
      setCsvAttachmentCount(countAttachment)

      if (!normalized.length) {
        setError('Tidak ada kontak valid. CSV minimal harus punya kolom name dan phone.')
      } else {
        setMessage('CSV terbaca: ' + normalized.length + ' kontak valid.')
      }

      setProgressText('')
      setProgressPercent(0)
    } catch (err) {
      resetCsv()
      setError(err.message || 'Gagal membaca CSV.')
      setProgressText('')
      setProgressPercent(0)
    } finally {
      e.target.value = ''
    }
  }

  function handleAttachUrl() {
    setMessage('')
    setError('')

    const cleanUrl = String(attachmentUrlInput || '').trim()

    if (!cleanUrl) {
      setError('URL attachment wajib diisi.')
      return
    }

    if (!isValidUrl(cleanUrl)) {
      setError('URL attachment tidak valid. Harus diawali http:// atau https://')
      return
    }

    const attachmentType =
      attachmentTypeInput === 'auto'
        ? guessAttachmentType(cleanUrl)
        : attachmentTypeInput

    const attachmentFilename = guessFileName(cleanUrl)

    setAttachmentMeta({
      attachment_url: cleanUrl,
      attachment_type: attachmentType,
      attachment_filename: attachmentFilename,
      attachment_caption: attachmentCaptionInput || attachmentFilename
    })

    setShowAttachBox(false)
    setMessage('Attachment URL siap: ' + attachmentFilename)
  }

  async function handleImport(e) {
    e.preventDefault()

    if (loading) return

    setLoading(true)
    setMessage('')
    setError('')
    setProgressText('Menyiapkan import...')
    setProgressPercent(3)

    await wait(100)

    try {
      const rows = rowsRef.current || []

      if (!databaseName.trim()) {
        throw new Error('Nama database wajib diisi.')
      }

      if (!rows.length) {
        throw new Error('CSV belum dipilih, kosong, atau tidak punya kontak valid.')
      }

      if (rows.length > MAX_ROWS) {
        throw new Error('Maksimal import adalah ' + MAX_ROWS + ' baris.')
      }

      setProgressText('Membuat database kontak...')
      setProgressPercent(8)
      await wait(100)

      const databaseResponse = await fetchWithTimeout(
        '/api/contacts/create-import-database',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            databaseName: databaseName.trim(),
            type: 'blast',

            default_attachment_url: attachmentMeta?.attachment_url || '',
            default_attachment_type: attachmentMeta?.attachment_type || '',
            default_attachment_filename: attachmentMeta?.attachment_filename || '',
            default_attachment_caption: attachmentMeta?.attachment_caption || ''
          })
        },
        15000
      )

      const databaseData = await readApiResponse(databaseResponse)

      if (!databaseResponse.ok || !databaseData.success || !databaseData.database?.id) {
        throw new Error(databaseData.message || 'Gagal membuat database kontak.')
      }

      const databaseId = databaseData.database.id

      let imported = 0
      let skipped = 0
      let withAttachment = 0
      const totalChunk = Math.ceil(rows.length / IMPORT_CHUNK_SIZE_SAFE)

      for (let i = 0; i < rows.length; i += IMPORT_CHUNK_SIZE_SAFE) {
        const currentChunk = Math.floor(i / IMPORT_CHUNK_SIZE_SAFE) + 1
        const chunk = rows.slice(i, i + IMPORT_CHUNK_SIZE_SAFE)

        const percent = 10 + Math.round((currentChunk / totalChunk) * 88)

        setProgressText('Import chunk ' + currentChunk + ' dari ' + totalChunk + '...')
        setProgressPercent(percent)
        await wait(80)

        const response = await fetchWithTimeout(
          '/api/contacts/import-chunk',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              databaseId,
              database_id: databaseId,
              type: 'blast',
              contacts: chunk,
              rows: chunk
            })
          },
          15000
        )

        const data = await readApiResponse(response)

        if (!response.ok || !data.success) {
          throw new Error(data.message || 'Import chunk gagal.')
        }

        imported += getInsertedCount(data, chunk.length)
        skipped += getSkippedCount(data)
        withAttachment += getAttachmentCount(data, chunk)

        await wait(120)
      }

      setProgressPercent(100)

      const defaultAttachmentText = attachmentMeta ? ' Default attachment: 1 URL.' : ''

      setMessage(
        'Import berhasil: ' +
          imported +
          ' kontak. Skipped: ' +
          skipped +
          '. Attachment per kontak dari CSV: ' +
          withAttachment +
          '.' +
          defaultAttachmentText
      )

      rowsRef.current = []
      setRowCount(0)
      setCsvAttachmentCount(0)
      setFileName('')
      setAttachmentMeta(null)
      setAttachmentUrlInput('')
      setAttachmentCaptionInput('')
      setProgressText('')
      setProgressPercent(0)
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Request terlalu lama dan dihentikan otomatis. Cek Database Manager apakah data sebagian sudah masuk.')
      } else {
        setError(err.message || 'Import blast gagal.')
      }

      setProgressText('')
      setProgressPercent(0)
    } finally {
      setLoading(false)
    }
  }

  const attachmentCount = attachmentMeta ? rowCount : csvAttachmentCount

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <Sidebar />

      <main className="flex-1 p-4 lg:p-8">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Import Database WhatsApp Blast
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Upload CSV berisi kontak untuk WhatsApp Blast atau Template Blast.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadBlastTemplateWithoutAttachment}
              disabled={loading}
              className="rounded-2xl bg-white px-4 py-3 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              Template Name + Phone
            </button>

            <button
              type="button"
              onClick={downloadTemplateBlastWithParams}
              disabled={loading}
              className="rounded-2xl bg-white px-4 py-3 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              Template Blast + Param
            </button>

            
              <button
                type="button"
                onClick={downloadTemplateBlastMultiParams}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200"
              >
                Template Multi Param
              </button>

              <button
                type="button"
                onClick={downloadReminderMultiParams}
                className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm"
              >
                Reminder Multi Param
              </button>

              <button
                type="button"
                onClick={downloadReminderMultiParamsWithAttachment}
                className="rounded-2xl bg-purple-600 px-5 py-3 text-sm font-bold text-white shadow-sm"
              >
                Reminder + Attachment
              </button>

              <button
                type="button"
                onClick={downloadTemplateParamsPipe}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200"
              >
                Template Params Pipe
              </button>

<button
              type="button"
              onClick={downloadBlastTemplateWithAttachment}
              disabled={loading}
              className="rounded-2xl bg-slate-900 px-4 py-3 text-xs font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Template Dengan Attachment
            </button>
          </div>
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
                disabled={loading}
                placeholder="Contoh: Blast Promo MCU Juni"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-600 disabled:bg-slate-100"
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
                disabled={loading}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-600 disabled:bg-slate-100"
              />
              {fileName ? (
                <p className="mt-2 text-xs text-slate-500">
                  File: {fileName}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-slate-400">
                Untuk Template Blast, CSV minimal cukup: name, phone. Untuk banyak variable Meta, gunakan param_1, param_2, param_3, dst sesuai urutan {'{{1}}'}, {'{{2}}'}, {'{{3}}'}.
              </p>
            </div>

            <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    Attachment default untuk semua kontak
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Untuk Template Blast header IMAGE/DOCUMENT, attachment bisa kosong karena akan memakai sample_url template.
                  </p>

                  {attachmentMeta ? (
                    <p className="mt-2 break-all text-xs font-semibold text-indigo-700">
                      Attachment siap: {attachmentMeta.attachment_filename}
                    </p>
                  ) : null}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAttachBox(true)}
                    disabled={loading}
                    className="rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Attach File / URL
                  </button>

                  {attachmentMeta ? (
                    <button
                      type="button"
                      onClick={() => setAttachmentMeta(null)}
                      disabled={loading}
                      className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-red-600 ring-1 ring-red-100 hover:bg-red-50 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>

              {showAttachBox ? (
                <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-indigo-100">
                  <label className="mb-2 block text-xs font-bold text-slate-600">
                    Attachment URL
                  </label>
                  <input
                    value={attachmentUrlInput}
                    onChange={(e) => setAttachmentUrlInput(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-600"
                  />

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-xs font-bold text-slate-600">
                        Attachment Type
                      </label>
                      <select
                        value={attachmentTypeInput}
                        onChange={(e) => setAttachmentTypeInput(e.target.value)}
                        className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-600"
                      >
                        <option value="auto">Auto</option>
                        <option value="image">Image</option>
                        <option value="document">Document</option>
                        <option value="video">Video</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-bold text-slate-600">
                        Caption
                      </label>
                      <input
                        value={attachmentCaptionInput}
                        onChange={(e) => setAttachmentCaptionInput(e.target.value)}
                        placeholder="Opsional"
                        className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-600"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={handleAttachUrl}
                      className="rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700"
                    >
                      Simpan Attachment URL
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowAttachBox(false)}
                      className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {rowCount > 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-700">
                  Preview: {rowCount} kontak valid
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Dengan attachment CSV/default: {attachmentCount} kontak
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Import berjalan per {IMPORT_CHUNK_SIZE_SAFE} baris.
                </p>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {loading ? 'Importing...' : 'Import Blast'}
            </button>

            {progressText ? (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span>{progressText}</span>
                  <span className="font-bold">{progressPercent}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-blue-100">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all"
                    style={{ width: progressPercent + '%' }}
                  />
                </div>
              </div>
            ) : null}

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