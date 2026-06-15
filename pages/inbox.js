import { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar'

export default function InboxPage() {
  const [conversations, setConversations] = useState([])
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [replyText, setReplyText] = useState('')
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function loadConversations() {
    setLoadingConversations(true)
    setError('')

    try {
      const response = await fetch('/api/inbox/list', {
        cache: 'no-store'
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal memuat inbox')
      }

      const list = data.conversations || []
      setConversations(list)

      if (!selectedConversation && list.length > 0) {
        setSelectedConversation(list[0])
        await loadMessages(list[0].phone)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingConversations(false)
    }
  }

  async function loadMessages(phone) {
    if (!phone) return

    setLoadingMessages(true)
    setError('')

    try {
      const response = await fetch(`/api/inbox/messages?phone=${encodeURIComponent(phone)}`, {
        cache: 'no-store'
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal memuat pesan')
      }

      setMessages(data.messages || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingMessages(false)
    }
  }

  async function selectConversation(conversation) {
    setSelectedConversation(conversation)
    await loadMessages(conversation.phone)
  }

  async function sendReply(e) {
    e.preventDefault()

    if (!selectedConversation?.phone || !replyText.trim()) {
      return
    }

    setSending(true)
    setError('')

    try {
      const response = await fetch('/api/inbox/reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone: selectedConversation.phone,
          message: replyText.trim()
        })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal mengirim balasan')
      }

      setReplyText('')
      await loadMessages(selectedConversation.phone)
      await loadConversations()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    loadConversations()
  }, [])

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />

      <main className="p-6 md:ml-64">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">WhatsApp Inbox</h1>
            <p className="text-sm text-slate-500">
              Pesan masuk dari webhook WhatsApp Business API.
            </p>
          </div>

          <button
            onClick={loadConversations}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Refresh
          </button>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid min-h-[650px] grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-1">
            <div className="border-b border-slate-200 p-4">
              <h2 className="font-semibold text-slate-900">Conversations</h2>
              <p className="text-xs text-slate-500">
                Total: {conversations.length}
              </p>
            </div>

            <div className="max-h-[590px] overflow-y-auto">
              {loadingConversations ? (
                <div className="p-4 text-sm text-slate-500">Loading inbox...</div>
              ) : conversations.length === 0 ? (
                <div className="p-4 text-sm text-slate-500">
                  Belum ada pesan masuk.
                </div>
              ) : (
                conversations.map((conversation) => {
                  const active = selectedConversation?.phone === conversation.phone

                  return (
                    <button
                      key={conversation.id || conversation.phone}
                      onClick={() => selectConversation(conversation)}
                      className={`block w-full border-b border-slate-100 p-4 text-left hover:bg-slate-50 ${
                        active ? 'bg-slate-100' : 'bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-slate-900">
                          {conversation.profile_name || conversation.phone}
                        </div>

                        {conversation.unread_count > 0 ? (
                          <span className="rounded-full bg-green-600 px-2 py-0.5 text-xs font-semibold text-white">
                            {conversation.unread_count}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        {conversation.phone}
                      </div>

                      <div className="mt-2 line-clamp-2 text-sm text-slate-600">
                        {conversation.last_message || '-'}
                      </div>

                      <div className="mt-2 text-xs text-slate-400">
                        {conversation.last_message_at
                          ? new Date(conversation.last_message_at).toLocaleString('id-ID')
                          : ''}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
            <div className="border-b border-slate-200 p-4">
              {selectedConversation ? (
                <>
                  <h2 className="font-semibold text-slate-900">
                    {selectedConversation.profile_name || selectedConversation.phone}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {selectedConversation.phone}
                  </p>
                </>
              ) : (
                <>
                  <h2 className="font-semibold text-slate-900">Detail Pesan</h2>
                  <p className="text-xs text-slate-500">
                    Pilih conversation dari kiri.
                  </p>
                </>
              )}
            </div>

            <div className="flex h-[500px] flex-col gap-3 overflow-y-auto bg-slate-50 p-4">
              {!selectedConversation ? (
                <div className="text-sm text-slate-500">
                  Belum ada conversation dipilih.
                </div>
              ) : loadingMessages ? (
                <div className="text-sm text-slate-500">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="text-sm text-slate-500">
                  Belum ada pesan untuk nomor ini.
                </div>
              ) : (
                messages.map((message) => {
                  const outgoing = message.direction === 'outgoing'

                  return (
                    <div
                      key={`${message.direction}-${message.id}`}
                      className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                          outgoing
                            ? 'bg-slate-900 text-white'
                            : 'bg-white text-slate-800'
                        }`}
                      >
                        <div className="whitespace-pre-wrap">
                          {message.message || '-'}
                        </div>

                        <div
                          className={`mt-2 text-[11px] ${
                            outgoing ? 'text-slate-300' : 'text-slate-400'
                          }`}
                        >
                          {message.created_at
                            ? new Date(message.created_at).toLocaleString('id-ID')
                            : ''}
                        </div>

                        {message.error_message ? (
                          <div className="mt-2 text-xs text-red-300">
                            {message.error_message}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <form onSubmit={sendReply} className="border-t border-slate-200 p-4">
              <div className="flex gap-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Tulis balasan..."
                  rows={2}
                  className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                  disabled={!selectedConversation || sending}
                />

                <button
                  type="submit"
                  disabled={!selectedConversation || !replyText.trim() || sending}
                  className="rounded-xl bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  )
}