import AppLayout from '../../components/AppLayout'
import StatCard from '../../components/StatCard'
import CalendarPicker from '../../components/CalendarPicker'
import DataTable from '../../components/DataTable'

export default function Dashboard() {
  return (
    <AppLayout title="Dashboard">
      <div className="mb-6">
        <h2 className="text-3xl font-bold tracking-tight text-[#172033]">Dashboard</h2>
        <p className="mt-2 text-sm text-[#718096]">Filter periode untuk melihat performa reminder dan WhatsApp Blast.</p>
      </div>

      <div className="medical-card mb-6 rounded-[28px] p-6">
        <CalendarPicker />
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Reminder Terkirim" value="0" caption="berhasil" icon="✓" tone="green" />
        <StatCard title="Reminder Gagal" value="0" caption="gagal" icon="!" tone="rose" />
        <StatCard title="Blast Terkirim" value="0" caption="berhasil" icon="✦" tone="purple" />
        <StatCard title="Blast Gagal" value="0" caption="gagal" icon="!" tone="rose" />
      </div>

      <div className="mt-7">
        <DataTable
          columns={[
            { key: 'module', label: 'Modul' },
            { key: 'sent', label: 'Terkirim' },
            { key: 'failed', label: 'Gagal' },
            { key: 'period', label: 'Periode' },
          ]}
          rows={[]}
          emptyText="Belum ada data dashboard."
        />
      </div>
    </AppLayout>
  )
}
