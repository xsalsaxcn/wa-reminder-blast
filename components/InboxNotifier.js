import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

const POLL_INTERVAL_MS = 5000
const TOAST_HIDE_MS = 9000

function cleanText(value) {
  return String(value || '').trim()
}

function getConversationTime(item) {
  const value =
    item?.last_message_at ||
    item?.updated_at ||
    item?.created_at ||
    ''

  const time = value ? new Date(value).getTime() : 0

  return Number.isFinite(time) ? time : 0
}

function getConversationKey(item) {
  return [
    cleanText(item?.phone),
    cleanText(item?.last_message_at),
    cleanText(item?.last_message),
    cleanText(item?.unread_count)
  ].join('|')
}

function isInboxPage(pathname) {
  return String(pathname || '').startsWith('/inbox')
}

function formatTime(value) {
  if (!value) return '-'

  try {
    const date = new Date(value)

    if (Number.isNaN(date.getTime())) return '-'

    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (err) {
    return '-'
  }
}

export default function InboxNotifier() {
  const router = useRouter()

  const [toast, setToast] = useState(null)
  const [permission, setPermission] = useState('default')
  const [enabled, setEnabled] = useState(true)
  const [panelOpen, setPanelOpen] = useState(false)
  const [conversations, setConversations] = useState([])
  const [totalUnread, setTotalUnread] = useState(0)
  const [latestUnread, setLatestUnread] = useState(null)

  const initializedRef = useRef(false)
  const knownRef = useRef(new Map())
  const toastTimerRef = useRef(null)
  const originalTitleRef = useRef('')
  const pollingRef = useRef(null)

  const unreadConversations = useMemo(() => {
    return (conversations || [])
      .filter((item) => Number(item.unread_count || 0) > 0)
      .sort((a, b) => getConversationTime(b) - getConversationTime(a))
      .slice(0, 8)
  }, [conversations])

  function closeToast() {
    setToast(null)

    if (typeof document !== 'undefined') {
      document.title = originalTitleRef.current || 'Notiva'
    }

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
  }

  function updateBrowserTitle(nextTotalUnread) {
    if (typeof document === 'undefined') return

    if (!originalTitleRef.current) {
      originalTitleRef.current = document.title || 'Notiva'
    }

    if (nextTotalUnread > 0) {
      document.title = `(${nextTotalUnread}) Pesan baru - Notiva`
    } else {
      document.title = originalTitleRef.current || 'Notiva'
    }
  }

  function showToast(payload) {
    setToast(payload)
    updateBrowserTitle(payload.unreadCount || 1)

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current)
    }

    toastTimerRef.current = setTimeout(() => {
      setToast(null)
      updateBrowserTitle(totalUnread)
    }, TOAST_HIDE_MS)
  }

  function openInbox(phone) {
    closeToast()
    setPanelOpen(false)

    if (phone) {
      router.push('/inbox?phone=' + encodeURIComponent(phone))
    } else {
      router.push('/inbox')
    }
  }

  async function requestPermission() {
    if (typeof window === 'undefined') return
    if (!('Notification' in window)) return

    try {
      const result = await Notification.requestPermission()
      setPermission(result)
    } catch (err) {
      console.error('Notification permission failed:', err)
    }
  }

  function showBrowserNotification(payload) {
    if (typeof window === 'undefined') return
    if (!('Notification' in window)) return
    if (Notification.permission !== 'granted') return

    try {
      const notification = new Notification(payload.title, {
        body: payload.body,
        icon: '/favicon.ico',
        tag: `notiva-inbox-${payload.phone || Date.now()}`,
        renotify: true
      })

      notification.onclick = () => {
        window.focus()
        openInbox(payload.phone)
        notification.close()
      }
    } catch (err) {
      console.error('Browser notification failed:', err)
    }
  }

  function detectNewMessages(nextConversations) {
    const safeConversations = nextConversations || []
    const currentMap = new Map()

    for (const item of safeConversations) {
      const phone = cleanText(item.phone)
      if (!phone) continue

      currentMap.set(phone, {
        key: getConversationKey(item),
        time: getConversationTime(item),
        unread: Number(item.unread_count || 0),
        item
      })
    }

    const nextTotalUnread = safeConversations.reduce(
      (sum, item) => sum + Number(item.unread_count || 0),
      0
    )

    const nextLatestUnread =
      safeConversations
        .filter((item) => Number(item.unread_count || 0) > 0)
        .sort((a, b) => getConversationTime(b) - getConversationTime(a))[0] || null

    setConversations(safeConversations)
    setTotalUnread(nextTotalUnread)
    setLatestUnread(nextLatestUnread)
    updateBrowserTitle(nextTotalUnread)

    if (!initializedRef.current) {
      knownRef.current = currentMap
      initializedRef.current = true
      return
    }

    const newItems = []

    for (const [phone, current] of currentMap.entries()) {
      const previous = knownRef.current.get(phone)

      if (!previous) {
        if (current.unread > 0) {
          newItems.push(current.item)
        }

        continue
      }

      const keyChanged = current.key !== previous.key
      const newerTime = current.time > previous.time
      const unreadIncreased = current.unread > previous.unread

      if ((keyChanged || newerTime || unreadIncreased) && current.unread > 0) {
        newItems.push(current.item)
      }
    }

    knownRef.current = currentMap

    if (!newItems.length) return

    const latest = newItems.sort((a, b) => getConversationTime(b) - getConversationTime(a))[0]

    const profileName = cleanText(latest.profile_name) || cleanText(latest.phone) || 'Customer'
    const phone = cleanText(latest.phone)
    const lastMessage = cleanText(latest.last_message) || 'Pesan baru masuk'

    const payload = {
      phone,
      unreadCount: nextTotalUnread || newItems.length,
      title: `Pesan baru dari ${profileName}`,
      body: lastMessage,
      profileName,
      lastMessage
    }

    showToast(payload)

    if (!isInboxPage(router.pathname)) {
      showBrowserNotification(payload)
    } else if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      showBrowserNotification(payload)
    }
  }

  async function checkInbox() {
    if (!enabled) return

    try {
      const response = await fetch('/api/inbox/list?t=' + Date.now(), {
        cache: 'no-store'
      })

      const data = await response.json()

      if (!response.ok || !data.success) return

      detectNewMessages(data.conversations || [])
    } catch (err) {
      console.error('Inbox notifier check failed:', err)
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    originalTitleRef.current = document.title || 'Notiva'

    if ('Notification' in window) {
      setPermission(Notification.permission)
    }

    checkInbox()

    pollingRef.current = setInterval(() => {
      if (document.visibilityState === 'visible' || Notification.permission === 'granted') {
        checkInbox()
      }
    }, POLL_INTERVAL_MS)

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [enabled, router.pathname])

  if (!enabled) return null

  return (
    <>
      <div className="fixed right-4 top-4 z-[9997]">
        <div className="relative">
          <button
            type="button"
            onClick={() => setPanelOpen((current) => !current)}
            className={`relative flex h-12 w-12 items-center justify-center rounded-2xl border shadow-xl transition ${
              totalUnread > 0
                ? 'border-green-200 bg-green-600 text-white hover:bg-green-700'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
            title="Notifikasi Inbox"
          >
            <span className="text-xl">🔔</span>

            {totalUnread > 0 ? (
              <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-black text-white ring-2 ring-white">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            ) : null}
          </button>

          {panelOpen ? (
            <div className="absolute right-0 mt-3 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
              <div className="border-b border-slate-100 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-900">Inbox Notification</p>
                    <p className="text-xs text-slate-500">
                      {totalUnread > 0
                        ? `${totalUnread} pesan belum dibaca`
                        : 'Tidak ada pesan baru'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPanelOpen(false)}
                    className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-200"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto">
                {unreadConversations.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500">
                    Belum ada pesan baru.
                  </div>
                ) : (
                  unreadConversations.map((item) => {
                    const profileName = cleanText(item.profile_name) || cleanText(item.phone)
                    const phone = cleanText(item.phone)
                    const message = cleanText(item.last_message) || '-'

                    return (
                      <button
                        key={phone}
                        type="button"
                        onClick={() => openInbox(phone)}
                        className="block w-full border-b border-slate-100 p-4 text-left hover:bg-slate-50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-bold text-slate-900">
                              {profileName}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-400">
                              {phone}
                            </p>
                          </div>

                          <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-black text-green-700">
                            {Number(item.unread_count || 0)}
                          </span>
                        </div>

                        <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                          {message}
                        </p>

                        <p className="mt-2 text-xs text-slate-400">
                          {formatTime(item.last_message_at)}
                        </p>
                      </button>
                    )
                  })
                )}
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-slate-100 p-3">
                <button
                  type="button"
                  onClick={() => openInbox(latestUnread?.phone)}
                  className="rounded-xl bg-green-600 px-4 py-2 text-xs font-black text-white hover:bg-green-700"
                >
                  Open Inbox
                </button>

                {permission !== 'granted' ? (
                  <button
                    type="button"
                    onClick={requestPermission}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-700"
                  >
                    Aktifkan Browser
                  </button>
                ) : (
                  <span className="text-xs font-semibold text-green-600">
                    Browser aktif
                  </span>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {toast ? (
        <div className="fixed bottom-4 right-4 z-[9999] w-[calc(100vw-2rem)] max-w-sm rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-green-50 text-lg">
              🔔
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-black text-slate-900">
                    {toast.title}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                    {toast.body}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Total unread: {toast.unreadCount}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeToast}
                  className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-200"
                >
                  ✕
                </button>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => openInbox(toast.phone)}
                  className="rounded-xl bg-green-600 px-4 py-2 text-xs font-black text-white hover:bg-green-700"
                >
                  Open Inbox
                </button>

                <button
                  type="button"
                  onClick={closeToast}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200"
                >
                  Nanti
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}