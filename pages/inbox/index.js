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
                          {new Date(msg.created_at).toLocaleString()} Â· {msg.status}
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
