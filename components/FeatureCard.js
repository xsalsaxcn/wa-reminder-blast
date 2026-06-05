import Link from 'next/link'

const toneMap = {
  rose: {
    iconBg: 'bg-[#fff1f4]',
    iconText: 'text-[#e45270]',
    accent: 'bg-[#e45270]',
    arrow: 'bg-[#fff1f4] text-[#e45270]',
  },
  blue: {
    iconBg: 'bg-[#eef7ff]',
    iconText: 'text-[#2e90fa]',
    accent: 'bg-[#2e90fa]',
    arrow: 'bg-[#eef7ff] text-[#2e90fa]',
  },
  green: {
    iconBg: 'bg-[#e9fbf8]',
    iconText: 'text-[#12b8a6]',
    accent: 'bg-[#12b8a6]',
    arrow: 'bg-[#e9fbf8] text-[#0f766e]',
  },
  purple: {
    iconBg: 'bg-[#eeeefe]',
    iconText: 'text-[#6d5dfc]',
    accent: 'bg-[#6d5dfc]',
    arrow: 'bg-[#eeeefe] text-[#6d5dfc]',
  },
  slate: {
    iconBg: 'bg-[#f1f5f9]',
    iconText: 'text-[#334155]',
    accent: 'bg-[#334155]',
    arrow: 'bg-[#f1f5f9] text-[#334155]',
  },
}

export default function FeatureCard({ title, description, icon = '•', href = '#', tone = 'purple' }) {
  const t = toneMap[tone] || toneMap.purple

  return (
    <Link href={href} className="group medical-card relative overflow-hidden rounded-[28px] p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(50,64,99,0.12)]">
      <div className={`absolute left-0 top-8 h-12 w-1.5 rounded-r-full ${t.accent}`} />
      <div className="flex items-start justify-between gap-5">
        <div>
          <div className={`mb-5 flex h-13 w-13 items-center justify-center rounded-2xl ${t.iconBg} ${t.iconText} text-xl font-bold`}>
            {icon}
          </div>
          <h3 className="text-lg font-bold tracking-tight text-[#172033]">{title}</h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-[#718096]">{description}</p>
        </div>
        <div className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${t.arrow} transition group-hover:translate-x-1`}>
          →
        </div>
      </div>
    </Link>
  )
}
