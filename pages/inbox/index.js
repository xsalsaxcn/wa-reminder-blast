import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import Sidebar from '../../components/Sidebar'

export default function InboxPage() {
  const router = useRouter()

  const [conversations, setConversations] = useState([])
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [replyText, setReplyText] = useState('')
  const [searchText, setSearchText] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)

  const selectedPhoneRef = useRef(null)
  const pollingRef = useRef(null)
  const messagesEndRef = useRef(null)

  const filteredConversations = useMemo(() => {
    const q = searchText.trim().toLowerCase()

    if (!q) return conversations

    return conversations.filter((item) => {
      const profileName = String(item.profile_name || '').toLowerCase()
      const phone = String(item.phone || '').toLowerCase()
      const lastMessage = String(item.last_message || '').toLowerCase()

      return (
        profileName.includes(q) ||
        phone.includes(q) ||
        lastMessage.includes(q)
      )
    })
  }, [conversations, searchText])

  function scrollToBottom() {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }

  function exportInboxContacts(mode) {
    const url = '/api/inbox/export-contacts?mode=' + mode + '&t=' + Date.now()
    window.open(url, '_blank')
  }

  async function loadMessages(phone, silent = false) {
    if (!phone) return

    if (!silent) setLoadingMessages(true)
    setError('')

    try {
      const response = await fetch(
        '/api/inbox/messages?phone=' + encodeURIComponent(phone) + '&t=' + Date.now(),
        { cache: 'no-store' }
      )

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal memuat pesan')
      }

      setMessages(data.messages || [])
      scrollToBottom()
    } catch (err) {
      setError(err.message || 'Gagal memuat pesan')
    } finally {
      if (!silent) setLoadingMessages(false)
    }
  }

  async function loadConversations(silent = false) {
    if (!silent) setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/inbox/list?t=' + Date.now(), {
        cache: 'no-store'
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal memuat inbox')
      }

      const list = data.conversations || []
      setConversations(list)
      setLastUpdated(new Date())

      if (list.length === 0) {
        setSelectedConversation(null)
        selectedPhoneRef.current = null
        setMessages([])
        return
      }

      const queryPhone =
        router?.query?.phone && typeof router.query.phone === 'string'
          ? router.query.phone
          : null

      const activePhone = selectedPhoneRef.current || queryPhone

      const stillExists = activePhone
        ? list.find((item) => item.phone === activePhone)
        : null

      const nextSelected = stillExists || list[0]

      setSelectedConversation(nextSelected)
      selectedPhoneRef.current = nextSelected.phone

      await loadMessages(nextSelected.phone, true)
    } catch (err) {
      setError(err.message || 'Gagal memuat inbox')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  async function selectConversation(conversation) {
    setSelectedConversation(conversation)
    selectedPhoneRef.current = conversation.phone
    await loadMessages(conversation.phone)
  }

  async function sendReply(e) {
    e.preventDefault()

    if (!selectedConversation?.phone || !replyText.trim()) return

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
      await loadMessages(selectedConversation.phone, true)
      await loadConversations(true)
    } catch (err) {
      setError(err.message || 'Gagal mengirim balasan')
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    if (!router.isReady) return

    if (router.query.phone && typeof router.query.phone === 'string') {
      selectedPhoneRef.current = router.query.phone
    }

    loadConversations()

    pollingRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadConversations(true)
      }
    }, 5000)

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [router.isReady, router.query.phone])

  return (
    <div className="min-h-screen bg-slate-100 md:flex">
      <Sidebar />

      <main className="flex-1 p-4 md:p-6">
        <div className="mx-auto flex h-[calc(100vh-48px)] max-w-7xl flex-col">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Inbox</h1>
              <p className="text-sm text-slate-500">
                Lihat balasan WhatsApp dari customer dan balas langsung dari aplikasi.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Live auto-refresh setiap 5 detik
                {lastUpdated
                  ? ` • Update terakhir: ${lastUpdated.toLocaleTimeString('id-ID')}`
                  : ''}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => exportInboxContacts('24h')}
                className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700"
              >
                Export 24 Jam
              </button>

              <button
                onClick={() => exportInboxContacts('all')}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
              >
                Export Semua
              </button>

              <button
                onClick={() => loadConversations(false)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700"
              >
                Refresh Inbox
              </button>
            </div>
          </div>

          {error ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-12">
            <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-4">
              <div className="border-b border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-900">Conversations</h2>
                    <p className="text-xs text-slate-500">
                      Total: {conversations.length}
                      {searchText.trim()
                        ? ` • Hasil: ${filteredConversations.length}`
                        : ''}
                    </p>
                  </div>

                  <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                    Live
                  </span>
                </div>

                <div className="mt-4 flex gap-2">
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Search nama, nomor, atau pesan..."
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                  />

                  {searchText ? (
                    <button
                      onClick={() => setSearchText('')}
                      className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {loading ? (
                  <div className="p-4 text-sm text-slate-500">Loading inbox...</div>
                ) : conversations.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500">
                    Belum ada conversation masuk.
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500">
                    Tidak ada conversation yang cocok dengan pencarian.
                  </div>
                ) : (
                  filteredConversations.map((item) => {
                    const active = selectedConversation?.phone === item.phone

                    return (
                      <button
                        key={item.id || item.phone}
                        onClick={() => selectConversation(item)}
                        className={`block w-full border-b border-slate-100 p-4 text-left transition hover:bg-slate-50 ${
                          active ? 'bg-blue-50' : 'bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-900">
                              {item.profile_name || item.phone}
                            </div>

                            <div className="mt-1 text-xs text-slate-500">
                              {item.phone}
                            </div>
                          </div>

                          {item.unread_count > 0 ? (
                            <span className="shrink-0 rounded-full bg-green-600 px-2 py-0.5 text-xs font-semibold text-white">
                              {item.unread_count}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-3 line-clamp-2 text-sm text-slate-700">
                          {item.last_message || '-'}
                        </div>

                        <div className="mt-2 text-xs text-slate-400">
                          {item.last_message_at
                            ? new Date(item.last_message_at).toLocaleString('id-ID')
                            : ''}
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </section>

            <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-8">
              <div className="border-b border-slate-200 p-4">
                <h2 className="font-semibold text-slate-900">
                  {selectedConversation
                    ? selectedConversation.profile_name || selectedConversation.phone
                    : 'Detail Pesan'}
                </h2>
                <p className="text-xs text-slate-500">
                  {selectedConversation ? selectedConversation.phone : 'Pilih conversation'}
                </p>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
                {!selectedConversation ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    Pilih conversation.
                  </div>
                ) : loadingMessages ? (
                  <div className="text-sm text-slate-500">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="text-sm text-slate-500">
                    Belum ada detail pesan untuk nomor ini.
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
                          className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                            outgoing
                              ? 'bg-green-600 text-white'
                              : 'bg-white text-slate-900'
                          }`}
                        >
                          <div className="whitespace-pre-wrap">
                            {msg.message || '-'}
                          </div>

                          <div
                            className={`mt-2 text-[11px] ${
                              outgoing ? 'text-green-100' : 'text-slate-400'
                            }`}
                          >
                            {msg.created_at
                              ? new Date(msg.created_at).toLocaleString('id-ID')
                              : ''}
                          </div>

                          {msg.error_message ? (
                            <div className="mt-2 text-xs text-red-200">
                              {msg.error_message}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )
                  })
                )}

                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={sendReply} className="border-t border-slate-200 bg-white p-4">
                <div className="flex gap-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Tulis balasan WhatsApp..."
                    rows={2}
                    disabled={!selectedConversation || sending}
                    className="flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 disabled:bg-slate-100"
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
        </div>
      </main>
    </div>
  )
}