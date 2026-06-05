import AppLayout from '../../components/AppLayout'
import DataTable from '../../components/DataTable'

export default function Blast() {
  async function runBlast() {
    const res = await fetch('/api/blast/run', { method: 'POST' })
    const data = await res.json()
    alert(data.message || 'Broadcast dijalankan.')
  }

  return (
    <AppLayout title="WhatsApp Blast">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#172033]">WhatsApp Blast</h2>
          <p className="mt-2 text-sm text-[#718096]">Pilih database kontak, jalankan broadcast, dan lihat status pengiriman.</p>
        </div>
        <button onClick={runBlast} className="rounded-2xl bg-[#6d5dfc] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-100 transition hover:bg-[#5847ee]">
          Run Broadcast
        </button>
      </div>

      <div className="medical-card mb-6 rounded-[28px] p-6">
        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-[#718096]">Pilih Database</span>
          <select className="h-12 w-full rounded-2xl border border-[#e7ecf5] bg-white px-4 text-sm outline-none focus:ring-4 focus:ring-[#eeeefe]">
            <option>Database WhatsApp Blast</option>
          </select>
        </label>
      </div>

      <DataTable
        columns={[
          { key: 'name', label: 'Nama' },
          { key: 'phone', label: 'Nomor WhatsApp' },
          { key: 'status', label: 'Status' },
          { key: 'time', label: 'Waktu' },
        ]}
        rows={[]}
        emptyText="Belum ada log WhatsApp Blast."
      />
    </AppLayout>
  )
}
