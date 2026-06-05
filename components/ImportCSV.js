export default function ImportCSV({ title = 'Import Database', description = 'Upload file CSV atau Excel untuk dimasukkan ke database.' }) {
  return (
    <div className="medical-card rounded-[28px] p-6">
      <h2 className="text-lg font-bold text-[#172033]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#718096]">{description}</p>

      <div className="mt-5 rounded-[24px] border-2 border-dashed border-[#d9e1ee] bg-[#f8fafc] p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eeeefe] text-xl text-[#6d5dfc]">↥</div>
        <p className="text-sm font-semibold text-[#172033]">Pilih file untuk diimport</p>
        <p className="mt-1 text-xs text-[#98a2b3]">Format yang disarankan: CSV</p>
        <input className="mt-5 block w-full rounded-2xl border border-[#e7ecf5] bg-white p-3 text-sm" type="file" accept=".csv,.xlsx,.xls" />
      </div>
    </div>
  )
}
