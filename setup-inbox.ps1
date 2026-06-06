New-Item -ItemType Directory -Force -Path "pages\api\webhooks" | Out-Null
New-Item -ItemType Directory -Force -Path "pages\api\inbox" | Out-Null
New-Item -ItemType Directory -Force -Path "pages\inbox" | Out-Null

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

function getTextFromMessage(message) {
  if (!message) return ''

  if (message.type === 'text') {
    return message.text?.body || ''
  }

  if (message.type === 'button') {
    return message.button?.text || ''
  }

  if (message.type === 'interactive') {
    return (
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title ||
      '[interactive message]'
    )
  }

  if (message.type === 'image') return '[image]'
  if (message.type === 'document') return '[document]'
  if (message.type === 'audio') return '[audio]'
  if (message.type === 'video') return '[video]'
  if (message.type === 'location') return '[location]'

  return `[${message.type || 'unknown'} message]`
}

async function saveIncomingMessage({ phone, profileName, message }) {
  const body = getTextFromMessage(message)
  const receivedAt = message.timestamp
    ? new Date(Number(message.timestamp) * 1000).toISOString()
    : new Date().toISOString()

  await supabaseAdmin
    .from('wa_incoming_messages')
    .upsert(
      {
        phone,
        profile_name: profileName || null,
        message_id: message.id || null,
        message_type: message.type || null,
        body,
        raw: message,
        received_at: receivedAt
      },
      {
        onConflict: 'message_id',
        ignoreDuplicates: true
      }
    )

  await supabaseAdmin
    .from('wa_conversations')
    .upsert(
      {
        phone,
        profile_name: profileName || null,
        last_message: body,
        last_message_at: receivedAt,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: 'phone'
      }
    )

  const { data: conversation } = await supabaseAdmin
    .from('wa_conversations')
    .select('unread_count')
    .eq('phone', phone)
    .maybeSingle()

  await supabaseAdmin
    .from('wa_conversations')
    .update({
      unread_count: Number(conversation?.unread_count || 0) + 1,
      updated_at: new Date().toISOString()
    })
    .eq('phone', phone)
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']

    if (
      mode === 'subscribe' &&
      token === process.env.META_WEBHOOK_VERIFY_TOKEN
    ) {
      return res.status(200).send(challenge)
    }

    return res.status(403).send('Forbidden')
  }

  if (req.method === 'POST') {
    try {
      const body = req.body

      const entries = body?.entry || []

      for (const entry of entries) {
        const changes = entry?.changes || []

        for (const change of changes) {
          const value = change?.value || {}
          const contacts = value?.contacts || []
          const messages = value?.messages || []

          for (const message of messages) {
            const phone = message.from
            const contact = contacts.find((item) => item.wa_id === phone)
            const profileName = contact?.profile?.name || null

            if (phone) {
              await saveIncomingMessage({
                phone,
                profileName,
                message
              })
            }
          }
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Webhook received'
      })
    } catch (error) {
      console.error('META_WEBHOOK_ERROR:', error)

      return res.status(500).json({
        success: false,
        message: error.message || 'Webhook error'
      })
    }
  }

  return res.status(405).json({
    success: false,
    message: 'Method not allowed'
  })
}
'@ | Set-Content -Encoding UTF8 "pages\api\webhooks\meta.js"

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin', 'user'])
  if (!authUser) return

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('wa_conversations')
      .select('*')
      .order('last_message_at', { ascending: false })

    if (error) throw error

    return res.status(200).json({
      success: true,
      data: data || []
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal mengambil inbox'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\inbox\list.js"

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin', 'user'])
  if (!authUser) return

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const { phone } = req.query

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'phone wajib diisi'
      })
    }

    const [incomingResult, outgoingResult] = await Promise.all([
      supabaseAdmin
        .from('wa_incoming_messages')
        .select('*')
        .eq('phone', phone)
        .order('received_at', { ascending: true }),

      supabaseAdmin
        .from('wa_outgoing_messages')
        .select('*')
        .eq('phone', phone)
        .order('sent_at', { ascending: true })
    ])

    if (incomingResult.error) throw incomingResult.error
    if (outgoingResult.error) throw outgoingResult.error

    const incoming = (incomingResult.data || []).map((item) => ({
      id: item.id,
      direction: 'in',
      phone: item.phone,
      text: item.body,
      message_type: item.message_type,
      created_at: item.received_at,
      status: 'received'
    }))

    const outgoing = (outgoingResult.data || []).map((item) => ({
      id: item.id,
      direction: 'out',
      phone: item.phone,
      text: item.message,
      created_at: item.sent_at,
      status: item.status,
      error_message: item.error_message
    }))

    const messages = [...incoming, ...outgoing].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    )

    await supabaseAdmin
      .from('wa_conversations')
      .update({
        unread_count: 0,
        updated_at: new Date().toISOString()
      })
      .eq('phone', phone)

    return res.status(200).json({
      success: true,
      data: messages
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal mengambil messages'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\inbox\messages.js"

@'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'
import { sendWhatsAppText } from '../../../lib/metaWhatsapp'

export default async function handler(req, res) {
  const authUser = requireRole(req, res, ['master', 'admin', 'user'])
  if (!authUser) return

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    })
  }

  try {
    const { phone, message } = req.body

    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        message: 'phone dan message wajib diisi'
      })
    }

    const result = await sendWhatsAppText({
      phone,
      message
    })

    await supabaseAdmin
      .from('wa_outgoing_messages')
      .insert({
        phone,
        message,
        status: result.ok ? 'sent' : 'failed',
        meta_message_id: result.messageId || null,
        error_message: result.error || null,
        sent_by: authUser.username || authUser.id || null
      })

    await supabaseAdmin
      .from('wa_conversations')
      .upsert(
        {
          phone,
          last_message: message,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          onConflict: 'phone'
        }
      )

    if (!result.ok) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Gagal mengirim reply'
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Reply berhasil dikirim',
      messageId: result.messageId
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Reply gagal'
    })
  }
}
'@ | Set-Content -Encoding UTF8 "pages\api\inbox\reply.js"

@'
import { useEffect, useState } from 'react'
import AppLayout from '../../components/AppLayout'

export default function InboxPage() {
  const [conversations, setConversations] = useState([])
  const [selectedPhone, setSelectedPhone] = useState('')
  const [messages, setMessages] = useState([])
  const [replyText, setReplyText] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')

  async function loadConversations() {
    const res = await fetch('/api/inbox/list')
    const json = await res.json()

    if (json.success) {
      setConversations(json.data || [])
    }
  }

  async function loadMessages(phone) {
    if (!phone) return

    setLoading(true)
    setNotice('')

    const res = await fetch(`/api/inbox/messages?phone=${encodeURIComponent(phone)}`)
    const json = await res.json()

    setLoading(false)

    if (json.success) {
      setMessages(json.data || [])
      await loadConversations()
    } else {
      setNotice(json.message || 'Gagal mengambil messages')
    }
  }

  async function sendReply(e) {
    e.preventDefault()

    if (!selectedPhone || !replyText.trim()) return

    setSending(true)
    setNotice('')

    const res = await fetch('/api/inbox/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: selectedPhone,
        message: replyText
      })
    })

    const json = await res.json()

    setSending(false)
    setNotice(json.message || 'Selesai')

    if (json.success) {
      setReplyText('')
      await loadMessages(selectedPhone)
      await loadConversations()
    }
  }

  function selectConversation(phone) {
    setSelectedPhone(phone)
    loadMessages(phone)
  }

  useEffect(() => {
    loadConversations()
  }, [])

  const selectedConversation = conversations.find((item) => item.phone === selectedPhone)

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Inbox</h1>
            <p className="mt-2 text-slate-500">
              Lihat balasan WhatsApp dari customer dan balas langsung dari aplikasi.
            </p>
          </div>

          <button
            onClick={loadConversations}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
          >
            Refresh Inbox
          </button>
        </div>

        {notice && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 shadow-sm">
            {notice}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-1">
            <h2 className="px-2 text-lg font-bold text-slate-900">Conversations</h2>

            <div className="mt-4 max-h-[650px] space-y-2 overflow-auto">
              {conversations.map((item) => {
                const active = item.phone === selectedPhone

                return (
                  <button
                    key={item.id}
                    onClick={() => selectConversation(item.phone)}
                    className={
                      active
                        ? 'w-full rounded-2xl bg-indigo-50 p-4 text-left'
                        : 'w-full rounded-2xl p-4 text-left hover:bg-slate-50'
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-900">
                          {item.profile_name || item.phone}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-400">
                          {item.phone}
                        </p>
                      </div>

                      {item.unread_count > 0 && (
                        <span className="rounded-full bg-rose-600 px-2 py-1 text-xs font-bold text-white">
                          {item.unread_count}
                        </span>
                      )}
                    </div>

                    <p className="mt-2 truncate text-sm text-slate-500">
                      {item.last_message || '-'}
                    </p>

                    <p className="mt-2 text-xs text-slate-400">
                      {item.last_message_at ? new Date(item.last_message_at).toLocaleString() : '-'}
                    </p>
                  </button>
                )
              })}

              {conversations.length === 0 && (
                <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-400">
                  Belum ada conversation masuk.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
            {selectedPhone ? (
              <div className="flex min-h-[650px] flex-col">
                <div className="border-b border-slate-100 px-2 pb-4">
                  <p className="text-lg font-bold text-slate-900">
                    {selectedConversation?.profile_name || selectedPhone}
                  </p>
                  <p className="text-sm font-semibold text-slate-400">
                    {selectedPhone}
                  </p>
                </div>

                <div className="flex-1 space-y-3 overflow-auto px-2 py-5">
                  {loading ? (
                    <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-400">
                      Loading messages...
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={`${msg.direction}-${msg.id}`}
                        className={
                          msg.direction === 'out'
                            ? 'ml-auto max-w-[80%] rounded-3xl bg-indigo-600 px-5 py-3 text-white'
                            : 'mr-auto max-w-[80%] rounded-3xl bg-slate-100 px-5 py-3 text-slate-800'
                        }
                      >
                        <p className="text-sm">{msg.text}</p>
                        <p
                          className={
                            msg.direction === 'out'
                              ? 'mt-2 text-xs text-indigo-100'
                              : 'mt-2 text-xs text-slate-400'
                          }
                        >
                          {new Date(msg.created_at).toLocaleString()} · {msg.status}
                        </p>
                        {msg.error_message && (
                          <p className="mt-2 text-xs text-rose-200">
                            {msg.error_message}
                          </p>
                        )}
                      </div>
                    ))
                  )}

                  {!loading && messages.length === 0 && (
                    <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-400">
                      Belum ada pesan.
                    </div>
                  )}
                </div>

                <form onSubmit={sendReply} className="border-t border-slate-100 pt-4">
                  <div className="flex gap-3">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={2}
                      placeholder="Tulis balasan..."
                      className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
                    />
                    <button
                      disabled={sending || !replyText.trim()}
                      className="rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {sending ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="flex min-h-[650px] items-center justify-center rounded-3xl bg-slate-50">
                <div className="text-center">
                  <p className="text-lg font-bold text-slate-700">Pilih conversation</p>
                  <p className="mt-2 text-sm text-slate-400">
                    Balasan WhatsApp customer akan tampil di sini.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
'@ | Set-Content -Encoding UTF8 "pages\inbox\index.js"

@'
import Link from 'next/link'
import { useRouter } from 'next/router'

const navItems = [
  { href: '/', label: 'Home', roles: ['master', 'admin', 'user'] },
  { href: '/dashboard', label: 'Dashboard', roles: ['master', 'admin', 'user'] },
  { href: '/inbox', label: 'Inbox', roles: ['master', 'admin', 'user'] },
  { href: '/reminder', label: 'Reminder', roles: ['master', 'admin', 'user'] },
  { href: '/blast', label: 'WhatsApp Blast', roles: ['master', 'admin', 'user'] },
  { href: '/jobs', label: 'Job Queue', roles: ['master', 'admin', 'user'] },
  { href: '/logs', label: 'Logs', roles: ['master', 'admin', 'user'] },

  { href: '/admin/import-reminder', label: 'Import Reminder', roles: ['master', 'admin'] },
  { href: '/admin/import-blast', label: 'Import Blast', roles: ['master', 'admin'] },
  { href: '/admin/database-manager', label: 'Database Manager', roles: ['master', 'admin'] },
  { href: '/admin/auto-worker', label: 'Auto Worker', roles: ['master', 'admin'] },
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
        <p className="text-sm font-medium opacity-90">Harmony Health</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight">
          WA Reminder & Blast
        </h1>
      </div>

      <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Logged in as
        </p>
        <p className="mt-1 text-sm font-bold text-slate-800">
          {user?.username || 'User'}
        </p>
        <p className="text-xs font-semibold text-indigo-600">
          {role}
        </p>
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
          Inbox and Auto Worker ready.
        </p>
      </div>
    </aside>
  )
}
'@ | Set-Content -Encoding UTF8 "components\Sidebar.js"

Write-Host "WhatsApp Inbox setup selesai."