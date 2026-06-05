import AppLayout from '../../components/AppLayout'

export default function ResetDB() {
  async function resetDb() {
    if (!confirm('Yakin ingin reset database dan storage?')) return
    const res = await fetch('/api/admin/reset-db', { method: 'POST' })
    const data = await res.json()
    alert(data.message || 'Request selesai.')
  }

  return (
    <AppLayout title="Reset Database">
      <div className="mb-6">
        <h2 className="text-3xl font-bold tracking-tight text-[#172033]">Admin / Reset DB</h2>
        <p className="mt-2 text-sm text-[#718096]">Gunakan fitur ini hanya jika ingin membersihkan database import dan log.</p>
      </div>

      <div className="medical-card rounded-[28px] p-6">
        <div className="rounded-[24px] bg-[#fff1f4] p-5">
          <h3 className="text-lg font-bold text-[#b42345]">Area Berisiko</h3>
          <p className="mt-2 text-sm leading-6 text-[#7a3448]">
            Aksi ini akan menghapus data contacts, reminders, blast logs, dan file import jika backend Supabase sudah aktif.
          </p>
          <button onClick={resetDb} className="mt-5 rounded-2xl bg-[#e45270] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-rose-100 hover:bg-[#c93c5a]">
            Reset Sekarang
          </button>
        </div>
      </div>
    </AppLayout>
  )
}
