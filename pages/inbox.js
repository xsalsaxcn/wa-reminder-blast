import { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar'

export default function InboxPage() {
  const [conversations, setConversations] = useState([])
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadConversations() {
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/inbox/list?t=' + Date.now(), {
        cache: 'no-store'
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Gagal memuat inbox')
      }

      setConversations(data.conversations || [])

      if ((data.conversations || []).length > 0) {
        const first = data.conversations[0]
        setSelected(first)
        loadMessages(first.phone)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadMessages(phone) {
    if (!phone) return

    try {
      const res = await fetch('/api/inbox/messages?phone=' + encodeURIComponent(phone) + '&t=' + Date.now(), {
        cache: 'no-store'
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Gagal memuat pesan')
      }

      setMessages(data.messages || [])
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSelect(conversation) {
    setSelected(conversation)
    await loadMessages(conversation.phone)
  }

  useEffect(() => {
    loadConversations()
  }, [])

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />

      <main className="p-6 md:ml-64">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">WhatsApp Inbox</h1>
            <p className="text-sm text-slate-500">
              Pesan masuk dari WhatsApp Business API.
            </p>
          </div>

          <button
            onClick={loadConversations}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Refresh
          </button>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl bg-white shadow lg:col-span-1">
            <div className="border-b p-4">
              <h2 className="font-semibold">Conversations</h2>
              <p className="text-xs text-slate-500">
                Total: {conversations.length}
              </p>
            </div>

            {loading ? (
              <div className="p-4 text-sm text-slate-500">Loading...</div>
            ) : conversations.length === 0 ? (
              <div className="p-4 text-sm text-slate-500">
                Belum ada inbox.
              </div>
            ) : (
              <div className="divide-y">
                {conversations.map((item) => (
                  <button
                    key={item.id || item.phone}
                    onClick={() => handleSelect(item)}
                    className={`w-full p-4 text-left hover:bg-slate-50 ${
                      selected?.phone === item.phone ? 'bg-slate-100' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-slate-900">
                        {item.profile_name || item.phone}
                      </div>

                      {item.unread_count > 0 ? (
                        <span className="rounded-full bg-green-600 px-2 py-0.5 text-xs text-white">
                          {item.unread_count}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      {item.phone}
                    </div>

                    <div className="mt-2 text-sm text-slate-700">
                      {item.last_message || '-'}
                    </div>

                    <div className="mt-2 text-xs text-slate-400">
                      {item.last_message_at
                        ? new Date(item.last_message_at).toLocaleString('id-ID')
                        : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl bg-white shadow lg:col-span-2">
            <div className="border-b p-4">
              <h2 className="font-semibold">
                {selected ? selected.profile_name || selected.phone : 'Detail Pesan'}
              </h2>
              <p className="text-xs text-slate-500">
                {selected ? selected.phone : 'Pilih conversation'}
              </p>
            </div>

            <div className="min-h-[500px] space-y-3 bg-slate-50 p-4">
              {!selected ? (
                <div className="text-sm text-slate-500">
                  Pilih conversation di kiri.
                </div>
              ) : messages.length === 0 ? (
                <div className="text-sm text-slate-500">
                  Belum ada detail pesan.
                </div>
              ) : (
                messages.map((msg) => {
                  const outgoing = msg.direction === 'outgoing'

                  return (
                    <div
                      key={`${msg.direction}-${msg.id}`}
                      className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                          outgoing
                            ? 'bg-slate-900 text-white'
                            : 'bg-white text-slate-900 shadow'
                        }`}
                      >
                        <div className="whitespace-pre-wrap">
                          {msg.message || '-'}
                        </div>

                        <div className={`mt-2 text-xs ${outgoing ? 'text-slate-300' : 'text-slate-400'}`}>
                          {msg.created_at
                            ? new Date(msg.created_at).toLocaleString('id-ID')
                            : ''}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}