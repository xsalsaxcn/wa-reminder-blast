import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'

function cleanText(value) {
  return String(value || '').trim()
}

function toNumber(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return number
}

function formatDate(value) {
  if (!value) return '-'

  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)

    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (err) {
    return String(value)
  }
}

function formatRupiah(value) {
  return 'Rp ' + toNumber(value).toLocaleString('id-ID')
}

function getFirst(row, keys, fallback) {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key]
    }
  }

  return fallback
}

function normalizeRow(row) {
  const target = toNumber(getFirst(row, ['target', 'total', 'total_items', 'total_contacts'], 0))
  const sent = toNumber(getFirst(row, ['accepted', 'accepted_count', 'sent', 'sent_items', 'sent_count'], 0))
  const delivered = toNumber(getFirst(row, ['delivered', 'delivered_count'], 0))
  const read = toNumber(getFirst(row, ['read', 'read_count'], 0))
  const failed = toNumber(getFirst(row, ['failed', 'failed_items', 'failed_count'], 0))
  const pendingCount = toNumber(getFirst(row, ['pending_count', 'pending'], 0))
  const processingCount = toNumber(getFirst(row, ['processing_count', 'processing_items'], 0))
  const replies = toNumber(getFirst(row, ['replies', 'reply_count', 'total_replies'], 0))

  const interested = toNumber(
    getFirst(row, ['interested', 'interested_count', 'positive', 'positive_count'], 0)
  )

  const followUp = toNumber(
    getFirst(row, ['follow_up', 'followup', 'follow_up_count'], 0)
  )

  const notInterested = toNumber(
    getFirst(row, ['not_interested', 'notInterested', 'not_interested_count', 'negative', 'negative_count'], 0)
  )

  const optOut = toNumber(
    getFirst(row, ['opt_out', 'optout', 'opt_out_count'], 0)
  )

  const hotLead = toNumber(
    getFirst(row, ['hot_lead', 'hotLead', 'hot_lead_count'], 0)
  )

  const noResponse = toNumber(
    getFirst(row, ['no_response', 'no_response_count', 'noResponse'], Math.max(0, sent - replies))
  )

  const needResponse = toNumber(
    getFirst(row, ['need_response', 'need_response_count', 'needResponse'], 0)
  )

  const avgResponseSeconds = toNumber(
    getFirst(row, ['avg_response_seconds', 'avgResponseSeconds'], 0)
  )

  const avgResponseTime = getFirst(
    row,
    ['avg_response_time', 'avgResponseTime'],
    avgResponseSeconds ? `${avgResponseSeconds} detik` : '-'
  )

  const fastestResponseTime = getFirst(row, ['fastest_response_time', 'fastestResponseTime'], '-')
  const slowestResponseTime = getFirst(row, ['slowest_response_time', 'slowestResponseTime'], '-')

  const score = toNumber(getFirst(row, ['score', 'lead_score'], 0))
  const cost = toNumber(getFirst(row, ['cost', 'estimated_cost', 'est_cost'], 0))
  const replyRate = toNumber(
    getFirst(row, ['reply_rate', 'replyRate'], sent > 0 ? Math.round((replies / sent) * 100) : 0)
  )
  const interestRate = toNumber(
    getFirst(row, ['interest_rate', 'interestRate', 'rate'], sent > 0 ? Math.round((interested / sent) * 100) : 0)
  )

  return {
    raw: row,
    id: getFirst(row, ['job_id', 'id', 'jobId'], ''),
    jobName: getFirst(row, ['job_name', 'name', 'title', 'database_name', 'campaign_name'], 'Campaign'),
    databaseName: getFirst(row, ['database_name', 'databaseName'], ''),
    type: getFirst(row, ['type', 'job_type'], '-'),
    sendMode: getFirst(row, ['send_mode', 'mode'], ''),
    status: getFirst(row, ['status', 'job_status'], '-'),
    createdAt: getFirst(row, ['created_at', 'createdAt', 'started_at'], ''),
    updatedAt: getFirst(row, ['updated_at', 'updatedAt'], ''),
    backgroundEnabled: Boolean(
      getFirst(row, ['background_enabled', 'backgroundEnabled'], false)
    ),
    backgroundActive: Boolean(
      getFirst(row, ['background_active', 'backgroundActive'], false)
    ),
    backgroundStale: Boolean(
      getFirst(row, ['background_stale', 'backgroundStale'], false)
    ),
    backgroundLastError: getFirst(
      row,
      ['background_last_error', 'backgroundLastError'],
      ''
    ),
    backgroundHeartbeatAt: getFirst(
      row,
      ['background_heartbeat_at', 'backgroundHeartbeatAt'],
      ''
    ),
    backgroundHeartbeatAgeSeconds: toNumber(
      getFirst(
        row,
        ['background_heartbeat_age_seconds', 'backgroundHeartbeatAgeSeconds'],
        0
      )
    ),
    target,
    sent,
    accepted: sent,
    delivered,
    read,
    failed,
    pendingCount,
    processingCount,
    replies,
    noResponse,
    needResponse,
    interested,
    followUp,
    notInterested,
    optOut,
    hotLead,
    score,
    cost,
    replyRate,
    interestRate,
    rate: interestRate,
    avgResponseSeconds,
    avgResponseTime,
    fastestResponseTime,
    slowestResponseTime
  }
}

function statusClass(status) {
  const text = cleanText(status).toLowerCase()

  if (text.includes('done') || text.includes('complete') || text.includes('sent')) {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  }

  if (text.includes('fail') || text.includes('error')) {
    return 'bg-red-50 text-red-700 ring-red-200'
  }

  if (text.includes('process') || text.includes('running')) {
    return 'bg-blue-50 text-blue-700 ring-blue-200'
  }

  return 'bg-slate-50 text-slate-700 ring-slate-200'
}

function typeClass(type) {
  const text = cleanText(type).toLowerCase()

  if (text.includes('reminder')) {
    return 'bg-violet-50 text-violet-700 ring-violet-200'
  }

  if (text.includes('blast')) {
    return 'bg-cyan-50 text-cyan-700 ring-cyan-200'
  }

  return 'bg-slate-50 text-slate-700 ring-slate-200'
}

function bucketLabel(bucket) {
  const map = {
    target: 'Target',
    sent: 'Accepted',
    accepted: 'Accepted',
    delivered: 'Delivered',
    read: 'Read',
    failed: 'Failed',
    replies: 'Replies',
    no_response: 'No Response',
    need_response: 'Need Response',
    interested: 'Interested',
    follow_up: 'Follow-up',
    not_interested: 'Not Interested',
    opt_out: 'Opt-out',
    hot_lead: 'Hot Lead',
    score: 'Score Detail',
    none: 'No Reply',
    neutral: 'Neutral'
  }

  return map[bucket] || bucket
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
      {hint ? (
        <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
      ) : null}
    </div>
  )
}

function MiniStat({ label, value, className, onClick }) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-2xl bg-slate-50 p-3 text-left transition hover:-translate-y-0.5 hover:bg-blue-50 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        title={`Klik untuk lihat detail ${label}`}
      >
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
          {label}
        </p>
        <p className={'mt-1 text-lg font-black ' + (className || 'text-slate-900')}>
          {value}
        </p>
        <p className="mt-1 text-[10px] font-semibold text-blue-500">
          Klik detail
        </p>
      </button>
    )
  }

  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className={'mt-1 text-lg font-black ' + (className || 'text-slate-900')}>
        {value}
      </p>
    </div>
  )
}


function explainFailedDeliveryReason(rawReason) {
  const raw = String(rawReason || '').trim()
  const value = raw.toLowerCase()

  if (!raw) {
    return {
      diagnosis: 'Alasan gagal belum tersedia',
      explanation:
        'Meta belum memberikan detail error yang cukup untuk menentukan penyebab pastinya.',
      action:
        'Jangan retry otomatis. Cek kembali status callback dan validitas nomor sebelum mencoba ulang.',
      raw: '-'
    }
  }

  if (value.includes('healthy ecosystem engagement')) {
    return {
      diagnosis: 'Dibatasi Meta karena engagement / quality',
      explanation:
        'Nomor belum tentu salah. Meta memilih tidak meneruskan pesan untuk menjaga kualitas engagement ekosistem WhatsApp.',
      action:
        'Jangan retry otomatis. Pastikan customer memang opt-in, isi pesan relevan, dan kategori template sesuai.',
      raw
    }
  }

  if (
    value.includes('not a valid whatsapp') ||
    value.includes('invalid whatsapp') ||
    value.includes('recipient is not valid') ||
    value.includes('invalid recipient') ||
    value.includes('not registered on whatsapp') ||
    value.includes('not registered with whatsapp') ||
    value.includes('phone number is invalid')
  ) {
    return {
      diagnosis: 'Nomor tidak valid / tidak terdaftar WhatsApp',
      explanation:
        'Error Meta secara eksplisit menunjukkan nomor penerima tidak valid atau tidak terdaftar sebagai akun WhatsApp.',
      action:
        'Cek kode negara, jumlah digit, salah ketik, dan pastikan nomor masih aktif di WhatsApp sebelum retry.',
      raw
    }
  }

  if (value.includes('message undeliverable')) {
    return {
      diagnosis: 'Pesan tidak dapat dikirim ke nomor ini',
      explanation:
        'Meta tidak memberi penyebab tunggal. Bisa terkait kondisi nomor, akun WhatsApp, perangkat penerima, atau kondisi delivery lain. Ini belum cukup untuk menyimpulkan nomor pasti tidak valid.',
      action:
        'Validasi nomor dan status WhatsApp customer. Jangan retry berulang tanpa verifikasi karena bisa tetap gagal atau menjadi spam.',
      raw
    }
  }

  if (
    value.includes('payment') ||
    value.includes('business eligibility') ||
    value.includes('billing')
  ) {
    return {
      diagnosis: 'Masalah billing / eligibility akun WhatsApp Business',
      explanation:
        'Pengiriman ditolak karena konfigurasi pembayaran atau kelayakan akun bisnis, bukan karena nomor customer.',
      action:
        'Cek WhatsApp Manager / Meta Business untuk payment method, billing, dan status eligibility akun.',
      raw
    }
  }

  if (
    value.includes('template') &&
    (
      value.includes('paused') ||
      value.includes('disabled') ||
      value.includes('not found') ||
      value.includes('does not exist')
    )
  ) {
    return {
      diagnosis: 'Template WhatsApp bermasalah',
      explanation:
        'Meta menolak karena template tidak tersedia, dinonaktifkan, dijeda, atau tidak cocok dengan template yang dipanggil.',
      action:
        'Cek status APPROVED template di Meta, nama template, bahasa, dan sinkronisasi template di Notiva.',
      raw
    }
  }

  if (
    value.includes('parameter') ||
    value.includes('number of parameters') ||
    value.includes('parameter format')
  ) {
    return {
      diagnosis: 'Parameter template tidak sesuai',
      explanation:
        'Jumlah atau format variable yang dikirim Notiva tidak sesuai struktur template yang disetujui Meta.',
      action:
        'Cocokkan variable body/header/button dengan template Meta sebelum mengirim ulang.',
      raw
    }
  }

  if (
    value.includes('rate limit') ||
    value.includes('too many') ||
    value.includes('throttl')
  ) {
    return {
      diagnosis: 'Terkena rate limit / pembatasan sementara Meta',
      explanation:
        'Meta sementara membatasi volume request. Nomor penerima belum tentu bermasalah.',
      action:
        'Tunggu dan retry terkontrol setelah jeda. Jangan kirim ulang massal sekaligus.',
      raw
    }
  }

  if (
    value.includes('re-engagement') ||
    value.includes('reengagement')
  ) {
    return {
      diagnosis: 'Dibatasi aturan re-engagement WhatsApp',
      explanation:
        'Meta tidak mengizinkan pesan tersebut pada kondisi engagement/customer session saat ini.',
      action:
        'Gunakan template yang sesuai kebijakan dan pastikan consent/opt-in customer tersedia.',
      raw
    }
  }

  return {
    diagnosis: 'Gagal dikirim oleh Meta',
    explanation:
      'Meta memberikan error, tetapi error tersebut belum dapat dipetakan ke kategori yang lebih spesifik oleh Notiva.',
    action:
      'Gunakan pesan raw Meta di bawah sebagai acuan. Jangan retry otomatis jika penyebab belum jelas.',
    raw
  }
}

function DetailPanel({ detail, loading, error, onClose }) {
  if (!detail) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 p-3 backdrop-blur-sm md:items-center md:justify-center">
      <div className="max-h-[88vh] w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-600">
              {bucketLabel(detail.bucket)}
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-900">
              {detail.jobName}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Job ID: {detail.jobId}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200"
          >
            Tutup
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto p-5">
          {loading ? (
            <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
              Loading detail...
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {!loading && !error && !detail.rows.length ? (
            <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
              Tidak ada kontak untuk kategori ini.
            </div>
          ) : null}

          {!loading && !error && detail.rows.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-3">Kontak</th>
                    <th className="px-3 py-3">Status</th>
                    {detail.bucket === 'failed' ? (
                      <th className="min-w-[320px] px-3 py-3">Alasan Gagal</th>
                    ) : null}
                    <th className="px-3 py-3">Reply / Message</th>
                    <th className="px-3 py-3">Kategori</th>
                    <th className="px-3 py-3">Response Time</th>
                    <th className="px-3 py-3">Waktu</th>
                    <th className="px-3 py-3">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {detail.rows.map((row) => (
                    <tr key={row.phone} className="border-b border-slate-100">
                      <td className="px-3 py-4">
                        <p className="font-bold text-slate-900">{row.name || row.phone}</p>
                        <p className="text-xs text-slate-500">{row.phone}</p>
                      </td>

                      <td className="px-3 py-4">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                          {row.delivery_status || row.status || '-'}
                        </span>
                      </td>

                      {detail.bucket === 'failed' ? (
                        <td className="min-w-[360px] px-3 py-4">
                          {(() => {
                            const failure = explainFailedDeliveryReason(
                              row.errorMessage || row.error_message || ''
                            )

                            return (
                              <div className="space-y-2 rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-xs leading-relaxed">
                                <div>
                                  <div className="font-black uppercase tracking-wide text-red-500">
                                    Diagnosis
                                  </div>
                                  <div className="mt-0.5 font-black text-red-800">
                                    {failure.diagnosis}
                                  </div>
                                </div>

                                <div>
                                  <div className="font-black uppercase tracking-wide text-slate-400">
                                    Penjelasan
                                  </div>
                                  <div className="mt-0.5 font-semibold text-slate-700">
                                    {failure.explanation}
                                  </div>
                                </div>

                                <div>
                                  <div className="font-black uppercase tracking-wide text-slate-400">
                                    Tindakan
                                  </div>
                                  <div className="mt-0.5 font-semibold text-slate-700">
                                    {failure.action}
                                  </div>
                                </div>

                                <details className="rounded-lg border border-red-100 bg-white px-2 py-1.5">
                                  <summary className="cursor-pointer font-black text-red-600">
                                    Meta raw
                                  </summary>
                                  <div className="mt-1 break-words font-mono text-[11px] text-slate-600">
                                    {failure.raw}
                                  </div>
                                </details>
                              </div>
                            )
                          })()}
                        </td>
                      ) : null}

                      <td className="max-w-md px-3 py-4 text-slate-700">
                        {row.lastReply || row.lastMessage || '-'}
                      </td>

                      <td className="px-3 py-4">
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                          {bucketLabel(row.replyBucket || 'none')}
                        </span>
                      </td>

                      <td className="px-3 py-4">
                        {row.hasReply && !row.hasAgentReply ? (
                          <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">
                            Need Response
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-slate-700">
                            {row.responseTime || '-'}
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-4 text-xs text-slate-500">
                        {formatDate(row.lastReplyAt || row.processedAt)}
                      </td>

                      <td className="px-3 py-4">
                        <Link
                          href={`/inbox?phone=${encodeURIComponent(row.phone)}${row.item_id ? `&job_item_id=${encodeURIComponent(row.item_id)}` : ''}`}
                          className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold !text-white hover:bg-blue-700"
                        >
                          Open Inbox
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function JobCard({ item, onMetricClick, onManualRunDone }) {
  const [manualRunning, setManualRunning] = useState(false)
  const [manualMessage, setManualMessage] = useState('')
  const serverBackgroundEnabled = Boolean(item?.backgroundEnabled)
  const serverBackgroundActive = Boolean(item?.backgroundActive)
  const serverBackgroundStale = Boolean(item?.backgroundStale)
  const [backgroundStarted, setBackgroundStarted] = useState(
    serverBackgroundActive
  )

  useEffect(() => {
    setBackgroundStarted(serverBackgroundActive)
  }, [item?.id, serverBackgroundActive])

  const sendMode = cleanText(item?.sendMode || item?.raw?.send_mode || item?.raw?.mode).toLowerCase()
  const jobName = cleanText(item?.jobName).toLowerCase()
  const isTemplateJob = sendMode === 'template' || jobName.startsWith('template blast')
  const remaining = Math.max(0, toNumber(item?.pendingCount))
  const processingCount = Math.max(0, toNumber(item?.processingCount))
  const canManualRun = Boolean(item?.id) && isTemplateJob && remaining > 0

  async function manualRun() {
    if (!canManualRun || manualRunning || backgroundStarted || serverBackgroundEnabled) return

    setManualRunning(true)
    setManualMessage(`Menyiapkan background runner untuk ${remaining} pending...`)

    try {
      const response = await fetch('/api/jobs/start-template-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ job_id: item.id })
      })

      const responseText = await response.text()
      let data = {}
      try {
        data = responseText ? JSON.parse(responseText) : {}
      } catch (error) {
        data = { success: false, message: responseText || `Background runner response non-JSON (HTTP ${response.status}).` }
      }

      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Gagal memulai background runner.')
      }

      setBackgroundStarted(true)
      setManualMessage(
        data.message ||
        (
          data.already_running
            ? 'Background masih aktif di server. Runner kedua tidak dibuat.'
            : 'Background aktif. Notiva/tab browser boleh ditutup.'
        )
      )

    } catch (err) {
      setManualMessage(`Background runner gagal dimulai: ${err.message || 'Unknown error'}`)
    } finally {
      setManualRunning(false)
    }
  }

  function exportSegment(segment) {
    if (!item?.id) {
      alert('Job ID tidak ditemukan.')
      return
    }

    const params = new URLSearchParams()
    params.set('job_id', item.id)
    params.set('segment', segment || 'all')
    params.set('t', String(Date.now()))

    window.open('/api/job-performance/export-segment?' + params.toString(), '_blank')
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="max-w-full truncate text-lg font-black text-slate-900">
              {item.jobName}
            </h3>

            <span className={'rounded-full px-3 py-1 text-xs font-black ring-1 ' + typeClass(item.type)}>
              {item.type}
            </span>

            <span className={'rounded-full px-3 py-1 text-xs font-black ring-1 ' + statusClass(item.status)}>
              {item.status}
            </span>

            {canManualRun ? (
              <button
                type="button"
                onClick={manualRun}
                disabled={
                  manualRunning ||
                  backgroundStarted ||
                  serverBackgroundEnabled
                }
                className="rounded-full bg-slate-900 px-3 py-1 text-xs font-black text-white shadow-sm hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                title={serverBackgroundEnabled
                  ? (
                      serverBackgroundStale
                        ? 'Auto Recovery aktif. Server akan mencoba melanjutkan otomatis; tidak perlu klik ulang.'
                        : 'Background masih aktif di server. Tombol dikunci untuk mencegah start berulang.'
                    )
                  : 'Jalankan sisa pending di background; browser boleh ditutup'}
              >
                {serverBackgroundEnabled
                  ? (
                      serverBackgroundStale
                        ? 'Auto Recovery'
                        : 'Background Running'
                    )
                  : (manualRunning ? 'Starting...' : 'Run Background')}
              </button>
            ) : null}
          </div>

          {manualMessage ? (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
              {manualMessage}
            </p>
          ) : null}

          {!manualMessage && serverBackgroundActive ? (
            <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
              Background aktif di server
              {item.backgroundHeartbeatAgeSeconds > 0
                ? ` · heartbeat ${item.backgroundHeartbeatAgeSeconds} detik lalu`
                : ''}
              . Browser boleh ditutup.
            </p>
          ) : null}

          {!manualMessage && serverBackgroundEnabled && serverBackgroundStale ? (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
              Auto Recovery aktif. Pending masih {remaining}. Server akan mencoba
              melanjutkan otomatis; tidak perlu klik ulang.
            </p>
          ) : null}

          {isTemplateJob ? (
            <p className="mt-2 text-xs font-semibold text-slate-500">
              Pending: {remaining} · Processing terkunci: {processingCount}
              {processingCount > 0 ? ' · Processing tidak dikirim ulang otomatis untuk mencegah duplicate.' : ''}
            </p>
          ) : null}

          <p className="mt-2 text-xs text-slate-400">
            {formatDate(item.createdAt)}
          </p>

          {item.id ? (
            <p className="mt-1 break-all text-xs text-slate-400">
              {item.id}
            </p>
          ) : null}

          {item.databaseName ? (
            <p className="mt-1 text-xs text-slate-400">
              Database: {item.databaseName}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[820px] xl:grid-cols-7">
          <MiniStat label="Target" value={item.target} onClick={() => onMetricClick(item, 'target')} />
          <MiniStat label="Accepted" value={item.sent} className="text-cyan-700" onClick={() => onMetricClick(item, 'accepted')} />
          <MiniStat label="Delivered" value={item.delivered} className="text-emerald-700" onClick={() => onMetricClick(item, 'delivered')} />
          <MiniStat label="Read" value={item.read} className="text-blue-700" onClick={() => onMetricClick(item, 'read')} />
          <MiniStat label="Failed" value={item.failed} className="text-red-700" onClick={() => onMetricClick(item, 'failed')} />
          <MiniStat
            label="Interest Rate"
            value={String(item.interestRate || item.rate) + '%'}
            className="text-blue-700"
          />
          <MiniStat
            label="Avg Response"
            value={item.avgResponseTime || '-'}
            className="text-orange-700"
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-9">
        <MiniStat label="Replies" value={item.replies} className="text-blue-700" onClick={() => onMetricClick(item, 'replies')} />
        <MiniStat label="Interested" value={item.interested} className="text-emerald-700" onClick={() => onMetricClick(item, 'interested')} />
        <MiniStat label="No Response" value={item.noResponse} className="text-slate-700" onClick={() => onMetricClick(item, 'no_response')} />
        <MiniStat label="Need Response" value={item.needResponse} className="text-orange-700" onClick={() => onMetricClick(item, 'need_response')} />
        <MiniStat label="Follow-up" value={item.followUp} className="text-amber-700" onClick={() => onMetricClick(item, 'follow_up')} />
        <MiniStat label="Not Int." value={item.notInterested} className="text-red-700" onClick={() => onMetricClick(item, 'not_interested')} />
        <MiniStat label="Opt-out" value={item.optOut} className="text-slate-700" onClick={() => onMetricClick(item, 'opt_out')} />
        <MiniStat label="Hot Lead" value={item.hotLead} className="text-emerald-700" onClick={() => onMetricClick(item, 'hot_lead')} />
        <MiniStat label="Score" value={`${item.score}/100`} className="text-slate-900" onClick={() => onMetricClick(item, 'score')} />
      </div>

      <div className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-cyan-700">
              Export Data Job Ini
            </p>
            <p className="mt-1 text-xs text-cyan-700">
              Download CSV per card: semua data, sudah baca, belum baca, reply, dan read no reply.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => exportSegment('all')}
              className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
            >
              Export Semua
            </button>

            <button
              type="button"
              onClick={() => exportSegment('read')}
              className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-emerald-700"
            >
              Sudah Baca
            </button>

            <button
              type="button"
              onClick={() => exportSegment('unread')}
              className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-amber-600"
            >
              Belum Baca
            </button>

            <button
              type="button"
              onClick={() => exportSegment('replied')}
              className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-blue-700"
            >
              Reply
            </button>

            <button
              type="button"
              onClick={() => exportSegment('no_reply_read')}
              className="rounded-xl bg-purple-600 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-purple-700"
            >
              Read No Reply
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
        <p className="text-xs text-slate-500">
          Cost estimate
        </p>
        <p className="text-sm font-black text-slate-900">
          {formatRupiah(item.cost)}
        </p>
      </div>

      <div className="mt-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-xs text-slate-500">
        <b>Rate:</b> Interested / Accepted. <b>Avg Response:</b> waktu rata-rata CS membalas setelah customer reply. <b>Score:</b> kualitas lead 0–100.
      </div>
    </div>
  )
}

const JOBS_PER_PAGE = 10

export default function JobPerformancePage() {
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({
    page: 1,
    page_size: JOBS_PER_PAGE,
    total_jobs: 0,
    total_pages: 1,
    has_prev: false,
    has_next: false,
    from: 0,
    to: 0
  })

  const [filters, setFilters] = useState({
    start: '',
    end: '',
    type: '',
    status: '',
    search: ''
  })

  const listRequestInFlightRef = useRef(false)

  function buildQuery(targetPage = page, includePaging = true) {
    const params = new URLSearchParams()

    if (filters.start) params.set('start', filters.start)
    if (filters.end) params.set('end', filters.end)
    if (filters.type) params.set('type', filters.type)
    if (filters.status) params.set('status', filters.status)
    if (filters.search) params.set('search', filters.search)

    if (includePaging) {
      params.set(
        'page',
        String(Math.max(1, toNumber(targetPage) || 1))
      )
      params.set('page_size', String(JOBS_PER_PAGE))
    }

    params.set('t', String(Date.now()))

    return params.toString()
  }

  async function loadData(nextPage = page, options = {}) {
    const silent = Boolean(options?.silent)

    if (silent && listRequestInFlightRef.current) {
      return
    }

    listRequestInFlightRef.current = true

    if (!silent) {
      setLoading(true)
      setError('')
    }

    try {
      const response = await fetch('/api/job-performance/list?' + buildQuery(nextPage, true), {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        cache: 'no-store'
      })

      const data = await response.json().catch(function () {
        return {}
      })

      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Gagal load job performance.')
      }

      const items = Array.isArray(data.items)
        ? data.items
        : Array.isArray(data.rows)
          ? data.rows
          : Array.isArray(data.data)
            ? data.data
            : []

      const nextPagination = data.pagination || {}
      const resolvedPage = Math.max(
        1,
        toNumber(nextPagination.page) ||
          toNumber(nextPage) ||
          1
      )

      setRows(items)
      setSummary(data.summary || null)
      setPage(resolvedPage)
      setPagination({
        page: resolvedPage,
        page_size:
          toNumber(nextPagination.page_size) ||
          JOBS_PER_PAGE,
        total_jobs:
          toNumber(nextPagination.total_jobs),
        total_pages: Math.max(
          1,
          toNumber(nextPagination.total_pages) || 1
        ),
        has_prev: Boolean(nextPagination.has_prev),
        has_next: Boolean(nextPagination.has_next),
        from: toNumber(nextPagination.from),
        to: toNumber(nextPagination.to)
      })
    } catch (err) {
      if (!silent) {
        setRows([])
        setSummary(null)
        setError(err.message || 'Gagal load job performance.')
      } else {
        console.warn(
          'Job Performance silent refresh gagal:',
          err.message || 'Unknown error'
        )
      }
    } finally {
      listRequestInFlightRef.current = false

      if (!silent) {
        setLoading(false)
      }
    }
  }

  async function openMetricDetail(item, bucket) {
    if (!item.id) {
      setDetail({
        jobId: '',
        jobName: item.jobName,
        bucket,
        rows: []
      })
      setDetailError('Job ID tidak tersedia untuk item ini.')
      return
    }

    setDetail({
      jobId: item.id,
      jobName: item.jobName,
      bucket,
      rows: []
    })
    setDetailLoading(true)
    setDetailError('')

    try {
      const params = new URLSearchParams()
      params.set('job_id', item.id)
      params.set('bucket', bucket)
      params.set('t', String(Date.now()))

      const response = await fetch('/api/job-performance/detail?' + params.toString(), {
        cache: 'no-store'
      })

      const data = await response.json().catch(function () {
        return {}
      })

      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Gagal memuat detail.')
      }

      setDetail({
        jobId: item.id,
        jobName: item.jobName,
        bucket,
        rows: data.rows || []
      })
    } catch (err) {
      setDetailError(err.message || 'Gagal memuat detail.')
    } finally {
      setDetailLoading(false)
    }
  }

  function exportCsv() {
    window.open('/api/job-performance/export?' + buildQuery(page, false), '_blank')
  }

  useEffect(function () {
    loadData(1)
  }, [])

  useEffect(function () {
    const timer = window.setInterval(function () {
      loadData(page, { silent: true })
    }, 60000)

    return function () {
      window.clearInterval(timer)
    }
  }, [
    page,
    filters.start,
    filters.end,
    filters.type,
    filters.status,
    filters.search
  ])

  const items = useMemo(function () {
    return rows.map(normalizeRow)
  }, [rows])

  const safeSummary = useMemo(function () {
    if (summary) {
      return {
        jobs: summary.jobs || summary.total_jobs || items.length || 0,
        target: summary.target || summary.total || 0,
        sent: summary.accepted || summary.sent || 0,
        delivered: summary.delivered || 0,
        read: summary.read || 0,
        failed: summary.failed || 0,
        replies: summary.replies || 0,
        noResponse: summary.no_response || summary.noResponse || 0,
        needResponse: summary.need_response || summary.needResponse || 0,
        hotLead: summary.hot_lead || summary.hotLead || 0,
        avgResponseTime: summary.avg_response_time || summary.avgResponseTime || '-',
        cost: summary.cost || 0
      }
    }

    return items.reduce(
      function (acc, item) {
        acc.jobs += 1
        acc.target += item.target
        acc.sent += item.sent
        acc.delivered += item.delivered
        acc.read += item.read
        acc.failed += item.failed
        acc.replies += item.replies
        acc.noResponse += item.noResponse
        acc.needResponse += item.needResponse
        acc.hotLead += item.hotLead
        acc.cost += item.cost
        return acc
      },
      {
        jobs: 0,
        target: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
        replies: 0,
        noResponse: 0,
        needResponse: 0,
        hotLead: 0,
        avgResponseTime: '-',
        cost: 0
      }
    )
  }, [items, summary])

  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      <Sidebar />

      <main className="flex-1 p-4 lg:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-900 lg:text-3xl">
                Job Performance
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Klik metric di setiap job untuk melihat daftar kontak dan buka Inbox langsung.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Avg Response = waktu rata-rata CS membalas setelah customer reply.
              </p>
              <p className="mt-1 text-xs font-semibold text-cyan-700">
                Maksimal 10 job per halaman agar loading cepat. Ringkasan mengikuti halaman aktif.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={exportCsv}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
              >
                Export CSV
              </button>

              <button
                type="button"
                onClick={() => loadData(1)}
                disabled={loading}
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-700 disabled:bg-slate-300"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>

          <section className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">
                Start
              </label>
              <input
                type="date"
                value={filters.start}
                onChange={function (e) {
                  setFilters({
                    ...filters,
                    start: e.target.value
                  })
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">
                End
              </label>
              <input
                type="date"
                value={filters.end}
                onChange={function (e) {
                  setFilters({
                    ...filters,
                    end: e.target.value
                  })
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">
                Type
              </label>
              <select
                value={filters.type}
                onChange={function (e) {
                  setFilters({
                    ...filters,
                    type: e.target.value
                  })
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              >
                <option value="">Semua</option>
                <option value="blast">Blast</option>
                <option value="reminder">Reminder</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">
                Status
              </label>
              <select
                value={filters.status}
                onChange={function (e) {
                  setFilters({
                    ...filters,
                    status: e.target.value
                  })
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              >
                <option value="">Semua</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="done">Done</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">
                Search
              </label>
              <input
                type="text"
                value={filters.search}
                onChange={function (e) {
                  setFilters({
                    ...filters,
                    search: e.target.value
                  })
                }}
                onKeyDown={function (e) {
                  if (e.key === 'Enter') loadData(1)
                }}
                placeholder="Cari job..."
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              />
            </div>
          </section>

          <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-11">
            <MetricCard label="Jobs" value={safeSummary.jobs} />
            <MetricCard label="Target" value={safeSummary.target} />
            <MetricCard label="Accepted" value={safeSummary.sent} />
            <MetricCard label="Delivered" value={safeSummary.delivered} />
            <MetricCard label="Read" value={safeSummary.read} />
            <MetricCard label="Failed" value={safeSummary.failed} />
            <MetricCard label="Replies" value={safeSummary.replies} />
            <MetricCard label="No Response" value={safeSummary.noResponse} />
            <MetricCard label="Need Response" value={safeSummary.needResponse} />
            <MetricCard label="Avg Response" value={safeSummary.avgResponseTime} />
            <MetricCard label="Est. Cost" value={formatRupiah(safeSummary.cost)} />
          </section>

          {error ? (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
              Loading job performance...
            </div>
          ) : null}

          {!loading && !items.length ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
              Belum ada data job performance.
            </div>
          ) : null}

          {!loading && items.length ? (
            <section className="space-y-4">
              {items.map(function (item, index) {
                return (
                  <JobCard
                    key={item.id || index}
                    item={item}
                    onMetricClick={openMetricDetail}
                    onManualRunDone={() => loadData(page)}
                  />
                )
              })}
            </section>
          ) : null}

          {!loading && pagination.total_jobs > 0 ? (
            <div className="mt-5 flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                Menampilkan{' '}
                <b className="text-slate-800">
                  {pagination.from}-{pagination.to}
                </b>{' '}
                dari{' '}
                <b className="text-slate-800">
                  {pagination.total_jobs}
                </b>{' '}
                job · maksimal 10 job/halaman
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadData(page - 1)}
                  disabled={loading || !pagination.has_prev}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ← Sebelumnya
                </button>

                <span className="min-w-[120px] text-center text-sm font-bold text-slate-700">
                  Halaman {pagination.page} / {pagination.total_pages}
                </span>

                <button
                  type="button"
                  onClick={() => loadData(page + 1)}
                  disabled={loading || !pagination.has_next}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Berikutnya →
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </main>

      <DetailPanel
        detail={detail}
        loading={detailLoading}
        error={detailError}
        onClose={() => {
          setDetail(null)
          setDetailError('')
        }}
      />
    </div>
  )
}