import AppLayout from '../../components/AppLayout'
import ImportCSV from '../../components/ImportCSV'

export default function ImportReminder() {
  return (
    <AppLayout title="Import Reminder">
      <div className="mb-6">
        <h2 className="text-3xl font-bold tracking-tight text-[#172033]">Import Database Reminder</h2>
        <p className="mt-2 text-sm text-[#718096]">Upload database kontak untuk pengiriman reminder.</p>
      </div>
      <ImportCSV title="Import Database Reminder" description="Upload daftar pasien atau peserta yang akan menerima reminder WhatsApp." />
    </AppLayout>
  )
}
