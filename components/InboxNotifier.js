import { useEffect, useMemo, useRef, useState } from 'react'

function cleanText(value) {
  return String(value || '').trim()
}

function toNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function formatDate(value) {
  if (!value) return ''

  try {
    return new Date(value).toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (error) {
    return ''
  }
}

function shortText(value, max = 75) {
  const text = cleanText(value)
  if (text.length <= max) return text
  return text.slice(0, max) + '...'
}

export default function InboxNotifier() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unreadTotal, setUnreadTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [browserEnabled, setBrowserEnabled] = useState(false)
  const [actionLoading, setActionLoading] = useState('')

  const previousUnreadRef = useRef(0)
  const audioContextRef = useRef(null)
  const pollingRef = useRef(null)

  const topItems = useMemo(() => {
    return items.slice(0, 30)
  }, [items])

  function playSound() {
    if (!soundEnabled) return

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) return

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext()
      }

      const ctx = audioContextRef.current
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()

      oscillator.type = 'sine'
      oscillator.frequency.value = 880
      gain.gain.value = 0.08

      oscillator.connect(gain)
      gain.connect(ctx.destination)

      oscillator.start()
      oscillator.stop(ctx.currentTime + 0.18)
    } catch (error) {
      console.error('Failed to play notification sound:', error)
    }
  }

  function showBrowserNotification(item) {
    if (!browserEnabled) return
    if (typeof window === 'undefined') return
    if (!('Notification' in window)) return
    if (Notification.permission !== 'granted') return

    try {
      const title = item.profile_name || item.phone || 'Pesan WhatsApp baru'
      const body = item.last_message || 'Ada pesan belum dibaca.'

      const notification = new Notification(title, {
        body,
        tag: 'notiva-inbox-' + (item.phone || Date.now())
      })

      notification.onclick = () => {
        window.focus()
        window.location.href = item.phone
          ? '/inbox?phone=' + encodeURIComponent(item.phone)
          : '/inbox'
      }
    } catch (error) {
      console.error('Failed to show browser notification:', error)
    }
  }

  async function loadNotifications(silent = false) {
    if (!silent) setLoading(true)

    try {
      const response = await fetch('/api/inbox/list?limit=10000&offset=0&t=' + Date.now(), {
        cache: 'no-store'
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal memuat inbox notification')
      }

      const conversations = data.conversations || []

      const unreadItems = conversations
        .map((item) => ({
          ...item,
          unread_count: Math.max(0, toNumber(item.unread_count, 0))
        }))
        .filter((item) => item.unread_count > 0)
        .sort((a, b) => {
          const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
          const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
          return bTime - aTime
        })

      const total = unreadItems.reduce((acc, item) => acc + item.unread_count, 0)
      const previous = previousUnreadRef.current

      setItems(unreadItems)
      setUnreadTotal(total)

      if (previous > 0 && total > previous && unreadItems[0]) {
        playSound()
        showBrowserNotification(unreadItems[0])
      }

      previousUnreadRef.current = total
    } catch (error) {
      console.error('Failed to load inbox notifications:', error)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  async function enableSoundAndBrowser() {
    setSoundEnabled(true)

    try {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission()
        setBrowserEnabled(permission === 'granted')
      }
    } catch (error) {
      setBrowserEnabled(false)
    }

    playSound()
  }

  async function markRead(phone) {
    const targetPhone = cleanText(phone)
    if (!targetPhone) return

    setActionLoading(targetPhone)

    try {
      await fetch('/api/inbox/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone: targetPhone
        })
      })

      setItems((current) => current.filter((item) => item.phone !== targetPhone))
      setUnreadTotal((current) => {
        const found = items.find((item) => item.phone === targetPhone)
        return Math.max(0, current - toNumber(found?.unread_count, 0))
      })

      setTimeout(() => loadNotifications(true), 300)
    } catch (error) {
      console.error('Failed to mark read:', error)
      loadNotifications(true)
    } finally {
      setActionLoading('')
    }
  }

  async function markAllRead() {
    setActionLoading('all')

    try {
      await fetch('/api/inbox/mark-all-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      setItems([])
      setUnreadTotal(0)
      previousUnreadRef.current = 0

      setTimeout(() => loadNotifications(true), 300)
    } catch (error) {
      console.error('Failed to mark all read:', error)
      loadNotifications(true)
    } finally {
      setActionLoading('')
    }
  }

  function openInbox(phone = '') {
    if (phone) {
      window.location.href = '/inbox?phone=' + encodeURIComponent(phone)
      return
    }

    window.location.href = '/inbox'
  }

  useEffect(() => {
    loadNotifications(true)

    pollingRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadNotifications(true)
      }
    }, 5000)

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [soundEnabled, browserEnabled])

  return (
    <div className="fixed right-4 top-4 z-[9999]">
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current)
          loadNotifications(true)
        }}
        className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-green-600 text-2xl text-white shadow-xl hover:bg-green-700"
        title="Inbox Notification"
      >
        🔔

        {unreadTotal > 0 ? (
          <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-2 py-1 text-xs font-black text-white ring-2 ring-white">
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="mt-3 w-[360px] max-w-[calc(100vw-32px)] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
            <div>
              <h3 className="text-lg font-black text-slate-950">Inbox Notification</h3>
              <p className="text-sm text-slate-500">
                {unreadTotal > 0 ? `${unreadTotal} pesan belum dibaca` : 'Tidak ada pesan belum dibaca'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full bg-slate-100 px-3 py-2 text-sm font-black text-slate-500 hover:bg-slate-200"
            >
              ×
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {loading ? (
              <div className="p-4 text-sm text-slate-500">Loading...</div>
            ) : topItems.length === 0 ? (
              <div className="p-5 text-sm text-slate-500">
                Semua pesan sudah dibaca.
              </div>
            ) : (
              topItems.map((item) => (
                <div key={item.phone} className="border-b border-slate-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => openInbox(item.phone)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate font-black text-slate-950">
                        {item.profile_name || item.phone}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {item.phone}
                      </div>
                      <div className="mt-2 line-clamp-2 text-sm text-slate-700">
                        {shortText(item.last_message, 95) || '-'}
                      </div>
                      <div className="mt-2 text-xs text-slate-400">
                        {formatDate(item.last_message_at)}
                      </div>
                    </button>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-black text-green-700">
                        {item.unread_count}
                      </span>

                      <button
                        type="button"
                        onClick={() => markRead(item.phone)}
                        disabled={actionLoading === item.phone || actionLoading === 'all'}
                        className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                      >
                        {actionLoading === item.phone ? '...' : 'Tandai sudah baca'}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-4">
            <button
              type="button"
              onClick={() => openInbox()}
              className="rounded-xl bg-green-600 px-3 py-3 text-sm font-black text-white hover:bg-green-700"
            >
              Open Inbox
            </button>

            <button
              type="button"
              onClick={markAllRead}
              disabled={actionLoading === 'all' || unreadTotal === 0}
              className="rounded-xl bg-red-50 px-3 py-3 text-sm font-black text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {actionLoading === 'all' ? 'Loading...' : 'Sudah baca semua'}
            </button>

            <button
              type="button"
              onClick={enableSoundAndBrowser}
              className="rounded-xl bg-amber-50 px-3 py-3 text-sm font-black text-amber-700 hover:bg-amber-100"
            >
              {soundEnabled ? 'Suara Aktif' : 'Aktifkan Suara'}
            </button>

            <button
              type="button"
              onClick={() => loadNotifications(false)}
              className="rounded-xl bg-slate-100 px-3 py-3 text-sm font-black text-slate-700 hover:bg-slate-200"
            >
              Refresh
            </button>
          </div>

          <div className="border-t border-slate-100 px-4 pb-4 text-xs text-slate-400">
            {browserEnabled ? 'Browser aktif' : 'Browser notification belum aktif'}
          </div>
        </div>
      ) : null}
    </div>
  )
}