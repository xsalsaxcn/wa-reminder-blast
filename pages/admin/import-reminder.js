import { useState } from 'react'
import Papa from 'papaparse'
import AppLayout from '../../components/AppLayout'

export default function ImportReminder() {
  const [databaseName, setDatabaseName] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: function(results) {
        setRows(results.data || [])
        setResult(`${results.data?.length || 0} baris terbaca dari file.`)
      }
    })
  }

  async function handleImport() {
    if (!databaseName) {
      alert('Nama database wajib diisi')
      return
    }

    if (rows.length === 0) {
      alert('Upload file CSV dulu')
      return
    }

    setLoading(true)
    setResult('Mengimport data...')

    const res = await fetch('/api/contacts/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        databaseName,
        type: 'reminder',
        contacts: rows
      })
    })

    const data = await res.json()
    setLoading(false)
    setResult(data.message || 'Selesai')
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Import Database Reminder</h1>
          <p className="mt-2 text-slate-500">
            Upload CSV berisi kontak reminder pasien/customer.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="block text-sm font-semibold text-slate-700">
            Nama Database
          </label>
          <input
            value={databaseName}
            onChange={(e) => setDatabaseName(e.target.value)}
            placeholder="Contoh: Reminder MCU Juni 2026"
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
          />

          <label className="mt-5 block text-sm font-semibold text-slate-700">
            File CSV
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={handleFile}
            className="mt-2 block w-full rounded-2xl border border-slate-200 px-4 py-3"
          />

          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            Format kolom CSV:
            <div className="mt-2 font-mono text-xs">
              name, phone, message, reminder_date, reminder_time
            </div>
          </div>

          <button
            onClick={handleImport}
            disabled={loading}
            className="mt-6 rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? 'Importing...' : 'Import Reminder'}
          </button>

          {result && (
            <p className="mt-4 text-sm font-medium text-slate-700">{result}</p>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
