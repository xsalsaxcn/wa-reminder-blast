import { useEffect, useMemo, useState } from 'react'
import AppLayout from '../components/AppLayout'

// NOTIVA_PATCH_06_SAFE_JOTFORM_AI_ASSISTANT_V1

const AGENT_ID = String(process.env.NEXT_PUBLIC_JOTFORM_AI_AGENT_ID || '').trim()
const AGENT_URL = String(process.env.NEXT_PUBLIC_JOTFORM_AI_AGENT_URL || '').trim()
const AGENT_TITLE = String(
  process.env.NEXT_PUBLIC_JOTFORM_AI_AGENT_TITLE || 'Notiva AI Assistant'
).trim()

function buildAgentUrl(parentUrl) {
  const base = AGENT_URL || (AGENT_ID ? `https://agent.jotform.com/${AGENT_ID}` : '')

  if (!base) return ''

  try {
    const url = new URL(base)

    if (!url.searchParams.has('embedMode')) url.searchParams.set('embedMode', 'iframe')
    if (!url.searchParams.has('background')) url.searchParams.set('background', '1')
    if (!url.searchParams.has('shadow')) url.searchParams.set('shadow', '0')
    if (!url.searchParams.has('isIframeEmbed')) url.searchParams.set('isIframeEmbed', '1')
    if (parentUrl && !url.searchParams.has('parentURL')) {
      url.searchParams.set('parentURL', parentUrl)
    }

    return url.toString()
  } catch (error) {
    return base
  }
}

function SetupCard() {
  return (
    <div className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-xl">
          AI
        </div>

        <div className="min-w-0">
          <h2 className="text-lg font-black text-slate-950">
            Jotform AI Agent belum dikonfigurasi
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Halaman AI Assistant sudah aktif. Tambahkan Agent ID Jotform di Vercel lalu redeploy.
          </p>

          <div className="mt-5 space-y-3 rounded-2xl border border-amber-200 bg-white p-4 text-sm text-slate-700">
            <p className="font-bold text-slate-900">Environment Variable:</p>
            <code className="block overflow-x-auto rounded-xl bg-slate-950 px-4 py-3 text-xs text-white">
              NEXT_PUBLIC_JOTFORM_AI_AGENT_ID=YOUR_AGENT_ID
            </code>
            <p className="text-xs leading-5 text-slate-500">
              Alternatif: gunakan NEXT_PUBLIC_JOTFORM_AI_AGENT_URL jika ingin memasukkan URL agent langsung.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AIAssistantPage() {
  const [parentUrl, setParentUrl] = useState('')
  const [frameLoaded, setFrameLoaded] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setParentUrl(window.location.href)
    }
  }, [])

  const agentSrc = useMemo(() => buildAgentUrl(parentUrl), [parentUrl])
  const configured = Boolean(AGENT_ID || AGENT_URL)

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-600">
              Jotform AI Agent
            </p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">
              AI Assistant
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Support assistant untuk penggunaan Notiva, troubleshooting, SOP, Reminder, Blast, Inbox, dan operasional admin.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={
                configured
                  ? 'rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 ring-1 ring-emerald-200'
                  : 'rounded-full bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 ring-1 ring-amber-200'
              }
            >
              {configured ? 'Agent Connected' : 'Setup Required'}
            </span>
          </div>
        </div>

        {!configured ? (
          <SetupCard />
        ) : (
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="font-black text-slate-950">{AGENT_TITLE}</p>
                <p className="mt-1 text-xs text-slate-500">
                  AI hanya membantu support. Aksi operasional Notiva tetap dilakukan melalui menu resmi.
                </p>
              </div>

              {agentSrc ? (
                <a
                  href={agentSrc}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
                >
                  Buka Fullscreen
                </a>
              ) : null}
            </div>

            <div className="relative min-h-[620px] bg-slate-50">
              {!frameLoaded ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50">
                  <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-500 shadow-sm">
                    Menyiapkan AI Assistant...
                  </div>
                </div>
              ) : null}

              {agentSrc ? (
                <iframe
                  id="notiva-jotform-ai-agent"
                  title={AGENT_TITLE}
                  src={agentSrc}
                  allow="geolocation; microphone; camera; fullscreen"
                  allowFullScreen
                  onLoad={() => setFrameLoaded(true)}
                  className="block h-[72vh] min-h-[620px] w-full border-0 bg-white"
                />
              ) : null}
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="font-black text-slate-900">Notiva Support</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Train agent dengan panduan Reminder, Blast, Inbox, Template, dan Job Performance.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="font-black text-slate-900">Assist Only</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Patch ini tidak memberi AI akses langsung untuk mengirim WhatsApp atau mengubah data.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="font-black text-slate-900">Safe Integration</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              WABA, webhook Meta, Reminder, Blast, scheduler, worker, dan Inbox tidak diubah.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
