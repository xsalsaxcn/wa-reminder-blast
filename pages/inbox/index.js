import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Sidebar from '../../components/Sidebar'

export default function InboxPage() {
  const router = useRouter()

  const [conversations, setConversations] = useState([])
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [oldestCursor, setOldestCursor] = useState('')
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [searchText, setSearchText] = useState('')
  const [messageSearchText, setMessageSearchText] = useState('')
  const [messageSearchOpen, setMessageSearchOpen] = useState(false)
  const [quickReplyTemplates, setQuickReplyTemplates] = useState([])
  const [attachmentFile, setAttachmentFile] = useState(null)
  const [attachmentPreview, setAttachmentPreview] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [mobileView, setMobileView] = useState('list')
  const [campaignTypeFilter, setCampaignTypeFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [conversationTotal, setConversationTotal] = useState(0)
  const [hasMoreConversations, setHasMoreConversations] = useState(false)
  const [loadingMoreConversations, setLoadingMoreConversations] = useState(false)

  const CONVERSATION_PAGE_SIZE = 50

  const selectedPhoneRef = useRef(null)
  const pollingRef = useRef(null)
  const messagesEndRef = useRef(null)
  const messagesScrollRef = useRef(null)
  const fileInputRef = useRef(null)

  const campaignTypeOptions = useMemo(() => {
    const set = new Set()

    for (const item of conversations || []) {
      if (item.campaign_type) set.add(item.campaign_type)
    }

    return Array.from(set).sort()
  }, [conversations])

  const projectOptions = useMemo(() => {
    const set = new Set()

    for (const item of conversations || []) {
      if (campaignTypeFilter !== 'all' && item.campaign_type !== campaignTypeFilter) continue
      if (item.project_name) set.add(item.project_name)
    }

    return Array.from(set).sort()
  }, [conversations, campaignTypeFilter])

  const filteredConversations = useMemo(() => {
    const q = searchText.trim().toLowerCase()

    return conversations.filter((item) => {
      const profileName = String(item.profile_name || '').toLowerCase()
      const phone = String(item.phone || '').toLowerCase()
      const lastMessage = String(item.last_message || '').toLowerCase()
      const campaignType = String(item.campaign_type || '').toLowerCase()
      const projectName = String(item.project_name || '').toLowerCase()
      const batchName = String(item.batch_name || '').toLowerCase()
      const campaignLabel = String(item.campaign_label || '').toLowerCase()

      const matchSearch =
        !q ||
        profileName.includes(q) ||
        phone.includes(q) ||
        lastMessage.includes(q) ||
        campaignType.includes(q) ||
        projectName.includes(q) ||
        batchName.includes(q) ||
        campaignLabel.includes(q)

      const matchCampaignType =
        campaignTypeFilter === 'all' || item.campaign_type === campaignTypeFilter

      const matchProject =
        projectFilter === 'all' || item.project_name === projectFilter

      return matchSearch && matchCampaignType && matchProject
    })
  }, [conversations, searchText, campaignTypeFilter, projectFilter])

  const filteredMessages = useMemo(() => {
    const q = messageSearchText.trim().toLowerCase()

    if (!q) return messages

    return messages.filter((msg) => {
      const text = String(msg.message || '').toLowerCase()
      const filename = String(msg.media_filename || '').toLowerCase()
      const caption = String(msg.media_caption || '').toLowerCase()
      const status = String(msg.status || '').toLowerCase()

      return (
        text.includes(q) ||
        filename.includes(q) ||
        caption.includes(q) ||
        status.includes(q)
      )
    })
  }, [messages, messageSearchText])

  function getWindowBadge(conversation) {
    if (!conversation) {
      return {
        label: '',
        className: '',
        note: ''
      }
    }

    if (conversation.window_status === 'open' || conversation.can_send_free_text) {
      const hours = conversation.hours_since_last_incoming
      const label = hours === null ? 'Open 24j' : 'Open 24j - ' + hours + 'j'

      return {
        label,
        className: 'bg-green-50 text-green-700 ring-green-100',
        note: conversation.window_note || 'Masih dalam window 24 jam.'
      }
    }

    if (conversation.window_status === 'no_inbound' || !conversation.has_customer_inbound) {
      return {
        label: 'No inbound',
        className: 'bg-slate-100 text-slate-600 ring-slate-200',
        note: conversation.window_note || 'Belum ada pesan masuk dari customer. Gunakan template untuk memulai chat.'
      }
    }

    return {
      label: 'Expired >24j',
      className: 'bg-red-50 text-red-700 ring-red-100',
      note: conversation.window_note || 'Expired >24 jam. Free text berisiko gagal, gunakan template untuk follow-up.'
    }
  }

  function getDirectMediaUrl(msg) {
    return (
      msg.media_url ||
      msg.attachment_url ||
      msg.image_url ||
      msg.file_url ||
      msg.document_url ||
      ''
    )
  }

  function isImageMessage(msg) {
    const type = String(msg.message_type || '').toLowerCase()
    const mime = String(msg.media_mime_type || '').toLowerCase()
    const url = String(getDirectMediaUrl(msg) || '').toLowerCase()

    return (
      type === 'image' ||
      mime.startsWith('image/') ||
      /\.(jpg|jpeg|png|webp|gif)(\?|$)/.test(url)
    )
  }

  function isVideoMessage(msg) {
    const type = String(msg.message_type || '').toLowerCase()
    const mime = String(msg.media_mime_type || '').toLowerCase()
    const url = String(getDirectMediaUrl(msg) || '').toLowerCase()

    return (
      type === 'video' ||
      mime.startsWith('video/') ||
      /\.(mp4|mov|webm)(\?|$)/.test(url)
    )
  }

  function isNearBottom() {
    const el = messagesScrollRef.current

    if (!el) return true

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight

    return distanceFromBottom < 120
  }

  function scrollToBottom(force = false) {
    if (!force && !isNearBottom()) return

    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: force ? 'auto' : 'smooth'
      })
    }, 100)
  }

  function markLocalConversationRead(phone) {
    const targetPhone = String(phone || '')

    if (!targetPhone) return

    setConversations((current) =>
      current.map((item) =>
        item.phone === targetPhone
          ? {
              ...item,
              unread_count: 0
            }
          : item
      )
    )

    setSelectedConversation((current) =>
      current?.phone === targetPhone
        ? {
            ...current,
            unread_count: 0
          }
        : current
    )
  }

  function exportInboxContacts(mode) {
    const url = '/api/inbox/export-contacts?mode=' + mode + '&t=' + Date.now()
    window.open(url, '_blank')
  }

  function applyQuickReply(templateText) {
    if (!templateText) return

    setReplyText((current) => {
      const existing = String(current || '').trim()

      if (!existing) return templateText

      return existing + '\n\n' + templateText
    })
  }

  async function loadQuickReplies() {
    try {
      const response = await fetch('/api/quick-replies/list?active=true&t=' + Date.now(), {
        cache: 'no-store'
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setQuickReplyTemplates(data.rows || [])
      }
    } catch (err) {
      console.error('Failed to load quick replies:', err)
    }
  }

  async function loadMessages(phone, silent = false, forceScroll = false, before = '') {
    if (!phone) return

    const appendOlder = Boolean(before)
    const scrollEl = messagesScrollRef.current
    const previousScrollHeight = scrollEl ? scrollEl.scrollHeight : 0

    if (appendOlder) setLoadingOlder(true)
    else if (!silent) setLoadingMessages(true)

    setError('')

    try {
      const shouldKeepBottom = isNearBottom()
      const params = new URLSearchParams()

      params.set('phone', phone)
      params.set('limit', appendOlder ? '50' : '50')
      params.set('t', String(Date.now()))

      if (before) params.set('before', before)

      const response = await fetch('/api/inbox/messages?' + params.toString(), {
        cache: 'no-store'
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal memuat pesan')
      }

      const nextMessages = data.messages || []

      setHasMoreMessages(Boolean(data.page?.has_more))
      setOldestCursor(data.page?.oldest_cursor || '')

      if (appendOlder) {
        setMessages((current) => {
          const existingKeys = new Set(
            current.map((item) => String(item.direction || '') + '-' + String(item.id || '') + '-' + String(item.created_at || ''))
          )

          const older = nextMessages.filter((item) => {
            const key = String(item.direction || '') + '-' + String(item.id || '') + '-' + String(item.created_at || '')
            return !existingKeys.has(key)
          })

          return [...older, ...current]
        })

        setTimeout(() => {
          const el = messagesScrollRef.current
          if (!el) return
          el.scrollTop = el.scrollHeight - previousScrollHeight
        }, 50)
      } else {
        setMessages(nextMessages)
        markLocalConversationRead(phone)

        if (forceScroll || shouldKeepBottom) {
          scrollToBottom(forceScroll)
        }
      }
    } catch (err) {
      setError(err.message || 'Gagal memuat pesan')
    } finally {
      if (appendOlder) setLoadingOlder(false)
      else if (!silent) setLoadingMessages(false)
    }
  }

  async function loadOlderMessages() {
    if (!selectedConversation?.phone || !oldestCursor || loadingOlder) return

    await loadMessages(selectedConversation.phone, true, false, oldestCursor)
  }

  async function loadConversations(silent = false, append = false) {
    if (append) setLoadingMoreConversations(true)
    else if (!silent) setLoading(true)

    setError('')

    try {
      const offset = append ? conversations.length : 0
      const params = new URLSearchParams()

      params.set('limit', String(CONVERSATION_PAGE_SIZE))
      params.set('offset', String(offset))
      params.set('t', String(Date.now()))

      const response = await fetch('/api/inbox/list?' + params.toString(), {
        cache: 'no-store'
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal memuat inbox')
      }

      const rawList = data.conversations || []
      const activePhoneForRead = selectedPhoneRef.current

      const list = rawList.map((item) =>
        item.phone === activePhoneForRead
          ? {
              ...item,
              unread_count: 0
            }
          : item
      )

      setConversationTotal(Number(data.page?.total || list.length))
      setHasMoreConversations(Boolean(data.page?.has_more))
      setLastUpdated(new Date())

      if (append) {
        setConversations((current) => {
          const map = new Map()

          for (const item of current || []) {
            if (item.phone) map.set(item.phone, item)
          }

          for (const item of list || []) {
            if (item.phone) map.set(item.phone, item)
          }

          return Array.from(map.values())
        })

        return
      }

      setConversations(list)

      if (list.length === 0) {
        setSelectedConversation(null)
        selectedPhoneRef.current = null
        setMessages([])
        setHasMoreMessages(false)
        setOldestCursor('')
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

      if (queryPhone) setMobileView('chat')

      await loadMessages(nextSelected.phone, true, !silent)
    } catch (err) {
      setError(err.message || 'Gagal memuat inbox')
    } finally {
      if (append) setLoadingMoreConversations(false)
      else if (!silent) setLoading(false)
    }
  }

  async function loadMoreConversations() {
    if (loadingMoreConversations || !hasMoreConversations) return

    await loadConversations(true, true)
  }

  async function selectConversation(conversation) {
    const nextConversation = {
      ...conversation,
      unread_count: 0
    }

    setSelectedConversation(nextConversation)
    selectedPhoneRef.current = conversation.phone
    setMobileView('chat')
    setMessageSearchText('')
    setMessageSearchOpen(false)
    markLocalConversationRead(conversation.phone)

    await loadMessages(conversation.phone, false, true)
  }

  function clearAttachment() {
    setAttachmentFile(null)
    setAttachmentPreview('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  function handleAttachmentChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]

    if (!allowedTypes.includes(file.type)) {
      setError('Format attachment belum didukung. Gunakan JPG, PNG, WEBP, PDF, DOC/DOCX, atau XLS/XLSX.')
      e.target.value = ''
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Ukuran file maksimal 5 MB.')
      e.target.value = ''
      return
    }

    setAttachmentFile(file)

    if (file.type.startsWith('image/')) {
      setAttachmentPreview(URL.createObjectURL(file))
    } else {
      setAttachmentPreview('')
    }
  }

  async function sendReply(e) {
    e.preventDefault()

    if (!selectedConversation?.phone) return
    if (!replyText.trim() && !attachmentFile) return

    setSending(true)
    setError('')

    try {
      if (attachmentFile) {
        const base64 = await fileToBase64(attachmentFile)

        const response = await fetch('/api/inbox/reply-attachment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            phone: selectedConversation.phone,
            caption: replyText.trim(),
            fileName: attachmentFile.name,
            mimeType: attachmentFile.type,
            base64
          })
        })

        const data = await response.json()

        if (!response.ok || !data.success) {
          throw new Error(data.message || 'Gagal mengirim attachment')
        }

        clearAttachment()
      } else {
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
      }

      setReplyText('')
      await loadMessages(selectedConversation.phone, true, true)
      await loadConversations(true)
    } catch (err) {
      setError(err.message || 'Gagal mengirim balasan')
    } finally {
      setSending(false)
    }
  }

  function mediaUrl(msg) {
    const params = new URLSearchParams()
    params.set('media_id', msg.media_id)
    params.set('filename', msg.media_filename || 'attachment')
    return '/api/inbox/media?' + params.toString()
  }

  function renderMedia(msg) {
    if (!msg.media_id) return null

    const type = String(msg.message_type || '').toLowerCase()
    const mime = String(msg.media_mime_type || '').toLowerCase()
    const url = mediaUrl(msg)

    if (type === 'image' || mime.startsWith('image/')) {
      return (
        <a href={url} target="_blank" rel="noreferrer" className="mt-2 block">
          <img
            src={url}
            alt={msg.media_caption || msg.media_filename || 'image'}
            className="max-h-64 rounded-xl object-cover"
          />
        </a>
      )
    }

    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-2 flex items-center gap-2 rounded-xl bg-white/20 px-3 py-2 text-sm font-semibold underline"
      >
        File: {msg.media_filename || 'Download attachment'}
      </a>
    )
  }

  function normalizeMessageStatus(status) {
    const text = String(status || '').toLowerCase()

    if (text === 'read') return 'read'
    if (text === 'delivered') return 'delivered'
    if (text === 'failed') return 'failed'
    if (text === 'error') return 'failed'
    if (text === 'processing') return 'processing'
    if (text === 'pending') return 'pending'
    if (text === 'sent') return 'sent'
    if (text === 'success') return 'sent'

    return text || 'sent'
  }

  function renderOutgoingStatus(msg) {
    if (msg.direction !== 'outgoing') return null

    const status = normalizeMessageStatus(msg.status)

    if (status === 'read') {
      return (
        <span className="ml-2 font-black text-sky-200" title="Read">
          ✓✓
        </span>
      )
    }

    if (status === 'delivered') {
      return (
        <span className="ml-2 font-black text-green-100" title="Delivered">
          ✓✓
        </span>
      )
    }

    if (status === 'failed') {
      return (
        <span className="ml-2 font-bold text-red-200" title="Failed">
          gagal
        </span>
      )
    }

    if (status === 'pending' || status === 'processing') {
      return (
        <span className="ml-2 font-bold text-green-100" title={status}>
          ...
        </span>
      )
    }

    return (
      <span className="ml-2 font-black text-green-100" title="Sent">
        ✓
      </span>
    )
  }

  useEffect(() => {
    if (!router.isReady) return

    if (router.query.phone && typeof router.query.phone === 'string') {
      selectedPhoneRef.current = router.query.phone
      setMobileView('chat')
    }

    loadConversations()
    loadQuickReplies()

    pollingRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadConversations(true)
      }
    }, 5000)

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [router.isReady, router.query.phone])

  const selectedWindowBadge = getWindowBadge(selectedConversation)

  return (
    <div className="min-h-[100dvh] bg-slate-100 md:flex md:h-[100dvh] md:overflow-hidden">
      <Sidebar />

      <main className="min-w-0 flex-1 md:overflow-hidden">
        <div className="mx-auto flex min-h-[100dvh] max-w-7xl flex-col p-3 md:h-full md:min-h-0 md:p-6">
          <div className="mb-3 flex shrink-0 flex-col gap-3 md:mb-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Inbox</h1>
              <p className="text-xs text-slate-500 md:text-sm">
                Lihat dan balas pesan WhatsApp customer.
              </p>
              <p className="mt-1 text-[11px] text-slate-400 md:text-xs">
                Auto-refresh 5 detik
                {lastUpdated ? ` - ${lastUpdated.toLocaleTimeString('id-ID')}` : ''}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 md:flex md:flex-wrap">
              <button
                onClick={() => exportInboxContacts('24h')}
                className="rounded-xl bg-green-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-green-700 md:px-4 md:text-sm"
              >
                Export 24J
              </button>

              <button
                onClick={() => exportInboxContacts('all')}
                className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 md:px-4 md:text-sm"
              >
                Export All
              </button>

              <button
                onClick={() => loadConversations(false)}
                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-700 md:px-4 md:text-sm"
              >
                Refresh
              </button>
            </div>
          </div>

          {error ? (
            <div className="mb-3 shrink-0 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 md:mb-4 md:p-4 md:text-sm">
              {error}
            </div>
          ) : null}

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
            <section
              className={`min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-4 lg:flex ${
                mobileView === 'chat' ? 'hidden lg:flex' : 'flex'
              }`}
            >
              <div className="shrink-0 border-b border-slate-200 p-3 md:p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-900">Conversations</h2>
                    <p className="text-xs text-slate-500">
                      Total: {conversationTotal || conversations.length} - Loaded: {conversations.length} - Tampil: {filteredConversations.length}
                    </p>
                  </div>

                  <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                    Live
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2">
                  <select
                    value={campaignTypeFilter}
                    onChange={(event) => {
                      setCampaignTypeFilter(event.target.value)
                      setProjectFilter('all')
                    }}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                  >
                    <option value="all">Semua Campaign</option>
                    {campaignTypeOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>

                  <select
                    value={projectFilter}
                    onChange={(event) => setProjectFilter(event.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                  >
                    <option value="all">Semua Project</option>
                    {projectOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Cari nama, nomor, pesan, campaign..."
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                  />

                  {searchText || campaignTypeFilter !== 'all' || projectFilter !== 'all' ? (
                    <button
                      onClick={() => {
                        setSearchText('')
                        setCampaignTypeFilter('all')
                        setProjectFilter('all')
                      }}
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
                  <div className="p-4 text-sm text-slate-500">Belum ada conversation masuk.</div>
                ) : filteredConversations.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500">Tidak ada conversation yang cocok.</div>
                ) : (
                  <>
                  {filteredConversations.map((item) => {
                    const active = selectedConversation?.phone === item.phone
                    const windowBadge = getWindowBadge(item)

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

                            {item.campaign_label ? (
                              <div className="mt-2 flex flex-wrap gap-1">
                                <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700 ring-1 ring-blue-100">
                                  {item.campaign_type || 'Campaign'}
                                </span>

                                {item.project_name ? (
                                  <span className="max-w-[180px] truncate rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                                    {item.project_name}
                                  </span>
                                ) : null}

                                {item.batch_name ? (
                                  <span className="max-w-[140px] truncate rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-semibold text-cyan-700">
                                    {item.batch_name}
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
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
                  })}

                  {hasMoreConversations ? (
                    <div className="p-4">
                      <button
                        type="button"
                        onClick={loadMoreConversations}
                        disabled={loadingMoreConversations}
                        className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-60"
                      >
                        {loadingMoreConversations ? 'Loading...' : 'Muat chat lainnya'}
                      </button>
                      <p className="mt-2 text-center text-xs text-slate-400">
                        Loaded {conversations.length} dari {conversationTotal || conversations.length} conversation
                      </p>
                    </div>
                  ) : null}
                  </>
                )}
              </div>
            </section>

            <section
              className={`min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-8 lg:flex ${
                mobileView === 'list' ? 'hidden lg:flex' : 'flex'
              }`}
            >
              <div className="shrink-0 border-b border-slate-200 bg-white p-3 md:p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setMobileView('list')}
                      className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 lg:hidden"
                    >
                      &lt; Back
                    </button>

                    <div className="min-w-0">
                      <h2 className="truncate font-semibold text-slate-900">
                        {selectedConversation
                          ? selectedConversation.profile_name || selectedConversation.phone
                          : 'Detail Pesan'}
                      </h2>
                      <p className="truncate text-xs text-slate-500">
                        {selectedConversation ? selectedConversation.phone : 'Pilih conversation'}
                      </p>

                      {selectedConversation?.campaign_label ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700 ring-1 ring-blue-100">
                            {selectedConversation.campaign_type || 'Campaign'}
                          </span>

                          {selectedConversation.project_name ? (
                            <span className="max-w-[260px] truncate rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                              {selectedConversation.project_name}
                            </span>
                          ) : null}

                          {selectedConversation.batch_name ? (
                            <span className="max-w-[180px] truncate rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-semibold text-cyan-700">
                              {selectedConversation.batch_name}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {selectedConversation ? (
                    <button
                      type="button"
                      onClick={() => setMessageSearchOpen((current) => !current)}
                      className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                    >
                      Search
                    </button>
                  ) : null}
                </div>

                {messageSearchOpen ? (
                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      value={messageSearchText}
                      onChange={(event) => setMessageSearchText(event.target.value)}
                      placeholder="Cari pesan di chat ini..."
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                    />

                    {messageSearchText ? (
                      <button
                        type="button"
                        onClick={() => setMessageSearchText('')}
                        className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {messageSearchText ? (
                  <p className="mt-2 text-xs text-slate-400">
                    Hasil: {filteredMessages.length} dari {messages.length} pesan.
                  </p>
                ) : null}
              </div>

              <div
                ref={messagesScrollRef}
                style={{
                  WebkitOverflowScrolling: 'touch',
                  touchAction: 'pan-y'
                }}
                className="min-h-[45dvh] flex-1 space-y-3 overflow-y-auto overscroll-contain bg-slate-50 p-3 md:min-h-0 md:p-4"
              >
                {!selectedConversation ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    Pilih conversation.
                  </div>
                ) : loadingMessages ? (
                  <div className="text-sm text-slate-500">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="text-sm text-slate-500">Belum ada detail pesan untuk nomor ini.</div>
                ) : filteredMessages.length === 0 ? (
                  <div className="text-sm text-slate-500">Tidak ada pesan yang cocok dengan pencarian.</div>
                ) : (
                  filteredMessages.map((msg) => {
                    const outgoing = msg.direction === 'outgoing'

                    return (
                      <div
                        key={`${msg.direction}-${msg.id}`}
                        className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm shadow-sm md:max-w-[78%] ${
                            outgoing ? 'bg-green-600 text-white' : 'bg-white text-slate-900'
                          }`}
                        >
                          {renderMedia(msg)}

                          {msg.message ? (
                            <div className="whitespace-pre-wrap break-words">
                              {msg.message}
                            </div>
                          ) : null}

                          <div
                            className={`mt-2 flex items-center justify-end text-[11px] ${
                              outgoing ? 'text-green-100' : 'text-slate-400'
                            }`}
                          >
                            <span>
                              {msg.created_at
                                ? new Date(msg.created_at).toLocaleString('id-ID')
                                : ''}
                            </span>
                            {renderOutgoingStatus(msg)}
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

              <form onSubmit={sendReply} className="shrink-0 border-t border-slate-200 bg-white p-3 md:p-4">
                {selectedConversation && selectedWindowBadge.note ? (
                  <div className={selectedConversation.can_send_free_text ? 'mb-3 rounded-xl border border-green-100 bg-green-50 p-3 text-xs font-semibold text-green-700' : 'mb-3 rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-semibold text-red-700'}>
                    {selectedWindowBadge.note}
                  </div>
                ) : null}
                {selectedConversation ? (
                  <div className="mb-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:text-xs">
                        Quick Reply
                      </p>

                      <div className="flex items-center gap-3">
                        <Link
                          href="/quick-replies"
                          className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                        >
                          Kelola
                        </Link>

                        {replyText ? (
                          <button
                            type="button"
                            onClick={() => setReplyText('')}
                            className="text-xs font-semibold text-red-600 hover:text-red-700"
                          >
                            Clear
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {quickReplyTemplates.length === 0 ? (
                      <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                        Belum ada template aktif.
                      </div>
                    ) : (
                      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                        {quickReplyTemplates.map((template) => (
                          <button
                            key={template.id || template.template_key}
                            type="button"
                            onClick={() => applyQuickReply(template.answer)}
                            className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                            title={template.question || template.answer || ''}
                          >
                            {template.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {attachmentFile ? (
                  <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          File: {attachmentFile.name}
                        </p>
                        <p className="text-xs text-slate-400">
                          {(attachmentFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={clearAttachment}
                        className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700"
                      >
                        Hapus
                      </button>
                    </div>

                    {attachmentPreview ? (
                      <img
                        src={attachmentPreview}
                        alt="Preview"
                        className="mt-3 max-h-40 rounded-xl object-cover"
                      />
                    ) : null}
                  </div>
                ) : null}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={handleAttachmentChange}
                  className="hidden"
                />

                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!selectedConversation || sending}
                    className="rounded-xl bg-slate-100 px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:bg-slate-100 disabled:text-slate-300"
                    title="Attach file"
                  >
                    Attach
                  </button>

                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={attachmentFile ? 'Tulis caption...' : 'Tulis balasan...'}
                    rows={1}
                    disabled={!selectedConversation || sending}
                    className="max-h-28 min-h-[48px] flex-1 resize-none rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-slate-900 disabled:bg-slate-100"
                  />

                  <button
                    type="submit"
                    disabled={!selectedConversation || (!replyText.trim() && !attachmentFile) || sending}
                    className="rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-300 md:px-5"
                  >
                    {sending ? '...' : 'Send'}
                  </button>
                </div>

                <p className="mt-2 hidden text-xs text-slate-400 md:block">
                  Bisa kirim JPG, PNG, WEBP, PDF, DOC/DOCX, XLS/XLSX. Maksimal 5 MB.
                </p>
              </form>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}