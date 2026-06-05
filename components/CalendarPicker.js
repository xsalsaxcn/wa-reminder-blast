export default function CalendarPicker({ start, end, onStartChange, onEndChange }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-[#718096]">Tanggal Mulai</span>
        <input
          type="date"
          value={start || ''}
          onChange={(e) => onStartChange && onStartChange(e.target.value)}
          className="h-11 w-full rounded-2xl border border-[#e7ecf5] bg-white px-4 text-sm outline-none focus:ring-4 focus:ring-[#eeeefe]"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-[#718096]">Tanggal Akhir</span>
        <input
          type="date"
          value={end || ''}
          onChange={(e) => onEndChange && onEndChange(e.target.value)}
          className="h-11 w-full rounded-2xl border border-[#e7ecf5] bg-white px-4 text-sm outline-none focus:ring-4 focus:ring-[#eeeefe]"
        />
      </label>
    </div>
  )
}
