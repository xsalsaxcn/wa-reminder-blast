export default function StatCard({ title, value, caption, icon = '•', tone = 'purple' }) {
  const tones = {
    purple: 'bg-[#eeeefe] text-[#6d5dfc]',
    green: 'bg-[#e9fbf8] text-[#0f766e]',
    blue: 'bg-[#eef7ff] text-[#2e90fa]',
    rose: 'bg-[#fff1f4] text-[#e45270]',
    slate: 'bg-[#f1f5f9] text-[#334155]',
  }

  return (
    <div className="medical-card rounded-[24px] p-5">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-bold ${tones[tone] || tones.purple}`}>
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-[#718096]">{title}</p>
          <div className="mt-1 flex items-end gap-2">
            <p className="text-2xl font-bold tracking-tight text-[#172033]">{value}</p>
            {caption ? <p className="pb-1 text-xs font-medium text-[#98a2b3]">{caption}</p> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
