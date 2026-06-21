New-Item -ItemType Directory -Force -Path "pages\api\admin" | Out-Null
New-Item -ItemType Directory -Force -Path "pages\admin" | Out-Null

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master'])
  if (!authUser) return

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    await supabaseAdmin.from('reminder_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabaseAdmin.from('blast_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabaseAdmin.from('contacts').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabaseAdmin.from('contact_databases').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    return res.status(200).json({
      success: true,
      message: 'Database kontak, reminder log, dan blast log berhasil direset. User dan WhatsApp settings tidak dihapus.'
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Reset database gagal'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\admin\reset-db.js"

@'
import { useState } from 'react'
import AppLayout from '../../components/AppLayout'

export default function ResetDatabasePage() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function resetDatabase() {
    const confirmed = confirm(
      'Yakin ingin reset database kontak dan semua log? User dan WhatsApp settings tidak akan dihapus.'
    )

    if (!confirmed) return

    setLoading(true)
    setMessage('')

    const res = await fetch('/api/admin/reset-db', {
      method: 'POST'
    })

    const json = await res.json()
    setLoading(false)
    setMessage(json.message || 'Selesai')
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Reset Database</h1>
          <p className="mt-2 text-slate-500">
            Hapus database kontak, reminder logs, dan WhatsApp blast logs dari sistem.
          </p>
        </div>

        <div className="rounded-3xl border border-rose-200 bg-white p-6 shadow-sm">
          <div className="rounded-2xl bg-rose-50 p-5">
            <h2 className="text-xl font-bold text-rose-700">Danger Zone</h2>
            <p className="mt-2 text-sm text-rose-600">
              Tindakan ini akan menghapus semua kontak, database import, dan log pengiriman.
              Data user dan WhatsApp settings tetap aman.
            </p>
          </div>

          <button
            onClick={resetDatabase}
            disabled={loading}
            className="mt-6 rounded-2xl bg-rose-600 px-5 py-3 font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {loading ? 'Resetting...' : 'Reset Database Sekarang'}
          </button>

          {message && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
              {message}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
'@ | Set-Content -Encoding UTF8 "pages\admin\reset-db.js"

@'
import Link from 'next/link'
import { useRouter } from 'next/router'

const navItems = [
  { href: '/', label: 'Home', roles: ['master', 'admin', 'user'] },
  { href: '/dashboard', label: 'Dashboard', roles: ['master', 'admin', 'user'] },
  { href: '/reminder', label: 'Reminder', roles: ['master', 'admin', 'user'] },
  { href: '/blast', label: 'WhatsApp Blast', roles: ['master', 'admin', 'user'] },
  { href: '/logs', label: 'Logs', roles: ['master', 'admin', 'user'] },

  { href: '/admin/import-reminder', label: 'Import Reminder', roles: ['master', 'admin'] },
  { href: '/admin/import-blast', label: 'Import Blast', roles: ['master', 'admin'] },
  { href: '/admin/meta-test', label: 'Meta API Test', roles: ['master', 'admin'] },
  { href: '/admin/whatsapp-settings', label: 'WhatsApp Settings', roles: ['master', 'admin'] },
  { href: '/admin/manage-users', label: 'Manage Users', roles: ['master', 'admin'] },
  { href: '/admin/reset-db', label: 'Reset DB', roles: ['master'] }
]

export default function Sidebar({ user }) {
  const router = useRouter()
  const role = user?.role || 'user'

  const visibleItems = navItems.filter((item) => item.roles.includes(role))

  return (
    <aside className="hidden min-h-screen w-72 shrink-0 border-r border-slate-200 bg-white px-5 py-6 lg:block">
      <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-sky-500 p-5 text-white shadow-lg shadow-indigo-100">
        <p className="text-sm font-medium opacity-90">Notiva</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight">WhatsApp Blast & Reminder</h1>
      </div>

      <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Logged in as</p>
        <p className="mt-1 text-sm font-bold text-slate-800">{user?.username || 'User'}</p>
        <p className="text-xs font-semibold text-indigo-600">{role}</p>
      </div>

      <nav className="mt-6 space-y-1">
        {visibleItems.map((item) => {
          const active = router.pathname === item.href

          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                active
                  ? 'block rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700'
                  : 'block rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-6 rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
        <p className="text-sm font-bold text-emerald-700">System Online</p>
        <p className="mt-1 text-xs text-emerald-600">
          API protected by login session.
        </p>
      </div>
    </aside>
  )
}
'@ | Set-Content -Encoding UTF8 "components\Sidebar.js"

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin'])
  if (!authUser) return

  try {
    if (req.method === 'GET') {
      const { type } = req.query

      let query = supabaseAdmin
        .from('whatsapp_settings')
        .select('*')
        .order('type', { ascending: true })

      if (type) {
        query = query.eq('type', type)
      }

      const { data, error } = await query

      if (error) throw error

      return res.status(200).json({
        success: true,
        data: type ? data?.[0] || null : data || []
      })
    }

    if (req.method === 'POST') {
      const {
        type,
        message_mode,
        template_name,
        language_code,
        template_variables,
        default_message
      } = req.body

      if (!type || !['reminder', 'blast'].includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'type harus reminder atau blast'
        })
      }

      const payload = {
        type,
        message_mode: message_mode || 'text',
        template_name: template_name || null,
        language_code: language_code || 'id',
        template_variables: Array.isArray(template_variables) ? template_variables : [],
        default_message: default_message || '',
        updated_at: new Date().toISOString()
      }

      const { data, error } = await supabaseAdmin
        .from('whatsapp_settings')
        .upsert(payload, { onConflict: 'type' })
        .select()
        .single()

      if (error) throw error

      return res.status(200).json({
        success: true,
        message: 'WhatsApp setting berhasil disimpan',
        data
      })
    }

    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\settings\whatsapp.js"

@'
import { sendWhatsAppText, sendWhatsAppTemplate } from '../../../lib/metaWhatsapp'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin'])
  if (!authUser) return

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

$runFiles = @("pages\api\reminder\run.js", "pages\api\blast\run.js")

foreach ($file in $runFiles) {
  if (Test-Path $file) {
    $content = Get-Content $file -Raw

    if ($content -notmatch "requireRole") {
      $content = "import { requireRole } from '../../../lib/auth'`r`n" + $content

      $content = $content -replace "export default async function handler\(req, res\) \{", "export default async function handler(req, res) {`r`n  const authUser = requireRole(req, res, ['master', 'admin', 'user'])`r`n  if (!authUser) return`r`n"

      Set-Content -Encoding UTF8 $file $content
    }
  }
}

Write-Host "Final security setup selesai."
