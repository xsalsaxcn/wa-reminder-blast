import AppLayout from '../../components/AppLayout'
import DataTable from '../../components/DataTable'

export default function Logs() {
  return (
    <AppLayout title="Logs">
      <div className="mb-6">
        <h2 className="text-3xl font-bold tracking-tight text-[#172033]">Logs</h2>
        <p className="mt-2 text-sm text-[#718096]">Riwayat pengiriman reminder dan WhatsApp Blast.</p>
      </div>
      <DataTable
        columns={[
          { key: 'module', label: 'Modul' },
          { key: 'recipient', label: 'Penerima' },
          { key: 'status', label: 'Status' },
          { key: 'time', label: 'Waktu' },
        ]}
        rows={[]}
        emptyText="Belum ada log."
      />
    </AppLayout>
  )
}
