import Head from 'next/head'
import Link from 'next/link'
import HfWorkerStatus from '../components/HfWorkerStatus'

export default function WorkerStatusPage() {
  return (
    <>
      <Head>
        <title>HF Worker Status - Notiva</title>
      </Head>

      <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                HF Worker Status
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Monitoring worker Hugging Face dipisahkan dari Job Performance agar halaman job tetap ringan.
              </p>
            </div>

            <Link
              href="/job-performance"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm"
            >
              Kembali ke Job Performance
            </Link>
          </div>

          <HfWorkerStatus />

          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
            <div className="font-semibold text-slate-900">Keepalive</div>
            <p className="mt-1">
              GitHub Actions memanggil endpoint status Notiva secara berkala, lalu Notiva melakukan health request ke HF.
              Monitoring ini tidak mengirim WhatsApp dan tidak memproses queue.
            </p>
          </div>
        </div>
      </main>
    </>
  )
}
