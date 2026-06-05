import AppLayout from '../../components/AppLayout'
import ImportCSV from '../../components/ImportCSV'

export default function ImportBlast() {
  return (
    <AppLayout title="Import WhatsApp Blast">
      <div className="mb-6">
        <h2 className="text-3xl font-bold tracking-tight text-[#172033]">Import Database WhatsApp Blast</h2>
        <p className="mt-2 text-sm text-[#718096]">Upload database kontak untuk broadcast WhatsApp.</p>
      </div>
      <ImportCSV title="Import Database WhatsApp Blast" description="Upload daftar kontak yang akan menerima pesan broadcast." />
    </AppLayout>
  )
}
