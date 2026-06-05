import AppLayout from '../components/AppLayout'
import FeatureCard from '../components/FeatureCard'
import StatCard from '../components/StatCard'

export default function Home() {
  return (
    <AppLayout title="Home">
      <section className="relative overflow-hidden rounded-[34px] border border-[#e7ecf5] bg-white p-8 shadow-[0_22px_70px_rgba(50,64,99,0.09)]">
        <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-[#eeeefe] blur-3xl" />
        <div className="absolute bottom-0 right-36 h-52 w-52 rounded-full bg-[#e9fbf8] blur-3xl" />

        <div className="relative grid gap-8 lg:grid-cols-[1.4fr_0.8fr] lg:items-center">
          <div>
            <div className="mb-5 inline-flex rounded-full border border-[#dff7f3] bg-[#e9fbf8] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0f766e]">
              Official Meta API Ready
            </div>
            <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-[#172033] md:text-5xl">
              WA Reminder & Blast
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-[#718096]">
              Kelola reminder dan broadcast WhatsApp dengan tampilan yang rapi, aman, efisien, dan profesional untuk operasional layanan kesehatan.
            </p>
          </div>

          <div className="relative rounded-[30px] bg-gradient-to-br from-[#eeeefe] via-white to-[#e9fbf8] p-6 shadow-inner">
            <div className="rounded-[26px] bg-white p-5 shadow-lg">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[#98a2b3]">Today</p>
                  <p className="text-lg font-bold text-[#172033]">Message Queue</p>
                </div>
                <div className="rounded-2xl bg-[#e9fbf8] px-3 py-2 text-sm font-bold text-[#0f766e]">Healthy</div>
              </div>
              <div className="space-y-3">
                <div className="rounded-2xl bg-[#f8fafc] p-4">
                  <div className="h-2 w-2/3 rounded-full bg-[#6d5dfc]" />
                  <div className="mt-3 h-2 w-full rounded-full bg-[#edf1f7]" />
                </div>
                <div className="rounded-2xl bg-[#f8fafc] p-4">
                  <div className="h-2 w-1/2 rounded-full bg-[#12b8a6]" />
                  <div className="mt-3 h-2 w-full rounded-full bg-[#edf1f7]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <FeatureCard href="/admin/reset-db" title="Admin / Reset DB" description="Kelola database dan reset data import dengan akses admin." icon="↻" tone="rose" />
        <FeatureCard href="/admin/manage-users" title="Manage Users" description="Buat dan kelola user untuk akses reminder dan broadcast." icon="◎" tone="blue" />
        <FeatureCard href="/reminder" title="Reminder" description="Pilih database, jalankan reminder, dan lihat log pengiriman." icon="◴" tone="green" />
        <FeatureCard href="/blast" title="WhatsApp Blast" description="Kirim broadcast WhatsApp ke banyak kontak secara resmi." icon="✦" tone="purple" />
        <FeatureCard href="/dashboard" title="Dashboard" description="Pantau jumlah terkirim, gagal, dan performa sistem." icon="▣" tone="slate" />
        <FeatureCard href="/logs" title="Logs" description="Lihat riwayat aktivitas reminder dan broadcast dalam satu tempat." icon="☰" tone="blue" />
      </section>

      <section className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Reminder Aktif" value="0" caption="jadwal" icon="◴" tone="green" />
        <StatCard title="Blast Terkirim" value="0" caption="pesan" icon="✦" tone="purple" />
        <StatCard title="Gagal Kirim" value="0" caption="log" icon="!" tone="rose" />
        <StatCard title="Status Sistem" value="Aman" caption="online" icon="✓" tone="blue" />
      </section>
    </AppLayout>
  )
}
