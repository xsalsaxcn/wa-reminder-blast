export default function Topbar({ title }) {
  return (
    <header className="sticky top-0 z-20 border-b border-[#e7ecf5] bg-white/82 px-6 py-4 backdrop-blur-xl lg:px-8">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#8b94a7]">Medical Operations Console</p>
          <h1 className="truncate text-xl font-bold tracking-tight text-[#172033]">{title}</h1>
        </div>

        <div className="hidden flex-1 justify-center md:flex">
          <div className="relative w-full max-w-md">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#98a2b3]">⌕</span>
            <input
              className="h-11 w-full rounded-2xl border border-[#e7ecf5] bg-[#f8fafc] pl-11 pr-4 text-sm outline-none transition focus:border-[#b8b2ff] focus:bg-white focus:ring-4 focus:ring-[#eeeefe]"
              placeholder="Cari database, log, atau menu..."
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-[#e7ecf5] bg-white text-[#667085] shadow-sm">
            ◌
            <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#12b8a6]" />
          </button>

          <div className="flex items-center gap-3 rounded-2xl border border-[#e7ecf5] bg-white px-3 py-2 shadow-sm">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#6d5dfc] to-[#12b8a6] text-sm font-bold text-white">
              A
            </div>
            <div className="hidden leading-tight sm:block">
              <div className="text-sm font-bold text-[#172033]">Admin</div>
              <div className="text-xs text-[#718096]">Master User</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
