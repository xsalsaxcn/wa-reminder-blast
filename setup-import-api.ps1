New-Item -ItemType Directory -Force -Path "lib" | Out-Null
New-Item -ItemType Directory -Force -Path "pages\api\contacts" | Out-Null
New-Item -ItemType Directory -Force -Path "pages\admin" | Out-Null

@'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing')
}

if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing')
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
'@ | Set-Content -Encoding UTF8 "lib\supabaseAdmin.js"

@'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
'@ | Set-Content -Encoding UTF8 "lib\supabaseClient.js"

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const { type } = req.query

    let query = supabaseAdmin
      .from('contact_databases')
      .select('*')
      .order('created_at', { ascending: false })

    if (type) {
      query = query.eq('type', type)
    }

    const { data, error } = await query

    if (error) throw error

    return res.status(200).json({
      success: true,
      data: data || []
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch databases'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\contacts\list.js"

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

function cleanPhone(phone) {
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const { databaseName, type, contacts } = req.body

    if (!databaseName || !type) {
      return res.status(400).json({
        success: false,
        message: 'databaseName dan type wajib diisi'
      })
    }

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'contacts kosong'
      })
    }

    const validContacts = contacts
      .map((row) => ({
        name: row.name || row.nama || '',
        phone: cleanPhone(row.phone || row.nomor || row.no_hp || row.whatsapp),
        message: row.message || row.pesan || '',
        reminder_date: row.reminder_date || row.tanggal || null,
        reminder_time: row.reminder_time || row.jam || null,
        status: 'active'
      }))
      .filter((row) => row.phone)

    if (validContacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tidak ada nomor WhatsApp valid'
      })
    }

    const { data: database, error: dbError } = await supabaseAdmin
      .from('contact_databases')
      .insert({
        name: databaseName,
        type,
        total_contacts: validContacts.length
      })
      .select()
      .single()

    if (dbError) throw dbError

    const contactsToInsert = validContacts.map((contact) => ({
      ...contact,
      database_id: database.id
    }))

    const { error: contactsError } = await supabaseAdmin
      .from('contacts')
      .insert(contactsToInsert)

    if (contactsError) throw contactsError

    return res.status(200).json({
      success: true,
      message: `Berhasil import ${validContacts.length} kontak`,
      database
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Import gagal'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\contacts\import.js"

@'
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
'@ | Set-Content -Encoding UTF8 "pages\admin\import-reminder.js"

@'
import { useState } from 'react'
import Papa from 'papaparse'
import AppLayout from '../../components/AppLayout'

export default function ImportBlast() {
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
        type: 'blast',
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
          <h1 className="text-3xl font-bold text-slate-900">Import Database WhatsApp Blast</h1>
          <p className="mt-2 text-slate-500">
            Upload CSV untuk kontak broadcast WhatsApp.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="block text-sm font-semibold text-slate-700">
            Nama Database
          </label>
          <input
            value={databaseName}
            onChange={(e) => setDatabaseName(e.target.value)}
            placeholder="Contoh: Blast Promo Vaksin Juni 2026"
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
              name, phone, message
            </div>
          </div>

          <button
            onClick={handleImport}
            disabled={loading}
            className="mt-6 rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? 'Importing...' : 'Import WhatsApp Blast'}
          </button>

          {result && (
            <p className="mt-4 text-sm font-medium text-slate-700">{result}</p>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
'@ | Set-Content -Encoding UTF8 "pages\admin\import-blast.js"

Write-Host "Setup import API selesai."