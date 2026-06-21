

import Link from 'next/link'
import Sidebar from '../components/Sidebar'

const menuCards = [
{
title: 'Dashboard',
description: 'Pantau jumlah terkirim, gagal, dan performa sistem.',
href: '/dashboard',
code: 'DB',
accent: 'border-cyan-400 bg-cyan-50 text-cyan-700'
},
{
title: 'Inbox',
description: 'Kelola pesan masuk dan balasan customer.',
href: '/inbox',
code: 'IN',
accent: 'border-blue-400 bg-blue-50 text-blue-700'
},
{
title: 'Quick Replies',
description: 'Siapkan template balasan cepat untuk agent.',
href: '/quick-replies',
code: 'QR',
accent: 'border-violet-400 bg-violet-50 text-violet-700'
},
{
title: 'Reply Analysis',
description: 'Analisa balasan customer dan performa follow-up.',
href: '/analysis',
code: 'AN',
accent: 'border-emerald-400 bg-emerald-50 text-emerald-700'
},
{
title: 'Reminder',
description: 'Pilih database, jalankan reminder, dan lihat log pengiriman.',
href: '/reminder',
code: 'RM',
accent: 'border-teal-400 bg-teal-50 text-teal-700'
},
{
title: 'WhatsApp Blast',
description: 'Kirim broadcast WhatsApp ke banyak kontak secara resmi.',
href: '/blast',
code: 'BL',
accent: 'border-indigo-400 bg-indigo-50 text-indigo-700'
},
{
title: 'Import Reminder',
description: 'Upload database kontak untuk jadwal reminder.',
href: '/admin/import-reminder',
code: 'IR',
accent: 'border-sky-400 bg-sky-50 text-sky-700'
},
{
title: 'Import Blast',
description: 'Upload database kontak untuk WhatsApp blast.',
href: '/admin/import-blast',
code: 'IB',
accent: 'border-fuchsia-400 bg-fuchsia-50 text-fuchsia-700'
},
{
title: 'Job Queue',
description: 'Kelola antrean pengiriman pesan dan attachment.',
href: '/jobs',
code: 'JQ',
accent: 'border-amber-400 bg-amber-50 text-amber-700'
},
{
title: 'Logs',
description: 'Lihat riwayat aktivitas reminder dan broadcast.',
href: '/logs',
code: 'LG',
accent: 'border-slate-400 bg-slate-50 text-slate-700'
},
{
title: 'Manage Users',
description: 'Buat dan kelola user untuk akses sistem.',
href: '/admin/manage-users',
code: 'US',
accent: 'border-blue-400 bg-blue-50 text-blue-700'
},
{
title: 'Admin / Reset DB',
description: 'Kelola database dan reset data import dengan akses admin.',
href: '/admin/reset-db',
code: 'AD',
accent: 'border-rose-400 bg-rose-50 text-rose-700'
}
]

export default function HomePage() {
return (
<div className="min-h-screen bg-slate-50 lg:flex">
<Sidebar />

<main className="flex-1 p-4 lg:p-8">
<section className="mb-8 overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-700 p-6 text-white shadow-sm lg:p-8">
<div className="max-w-4xl">
<p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-100">
Notiva
</p>
<h1 className="mt-3 text-3xl font-black leading-tight lg:text-5xl">
WhatsApp Automation Platform
</h1>
<p className="mt-4 max-w-2xl text-sm leading-6 text-cyan-50 lg:text-base">
Kelola WhatsApp blast, reminder, inbox, quick replies, attachment, job queue, dan monitoring dalam satu sistem profesional.
</p>
</div>
</section>

<section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
{menuCards.map((item) => (
<Link href={item.href} key={item.href} legacyBehavior>
<a className="group rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-cyan-200 hover:shadow-lg">
<div className="flex items-start justify-between gap-4">
<div
className={
'flex h-12 w-12 items-center justify-center rounded-2xl border-l-4 text-sm font-black ' +
item.accent
}
>
{item.code}
</div>

<div className="rounded-2xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-500 group-hover:bg-cyan-50 group-hover:text-cyan-700">
Go
</div>
</div>

<h2 className="mt-6 text-lg font-black text-slate-900">
{item.title}
</h2>
<p className="mt-2 text-sm leading-6 text-slate-500">
{item.description}
</p>
</a>
</Link>
))}
</section>

<section className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
<div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
<p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
Reminder Aktif
</p>
<p className="mt-2 text-3xl font-black text-slate-900">0</p>
<p className="text-xs text-slate-500">jadwal</p>
</div>

<div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
<p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
Blast Terkirim
</p>
<p className="mt-2 text-3xl font-black text-slate-900">0</p>
<p className="text-xs text-slate-500">pesan</p>
</div>

<div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
<p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
Gagal Kirim
</p>
<p className="mt-2 text-3xl font-black text-slate-900">0</p>
<p className="text-xs text-slate-500">log</p>
</div>

<div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
<p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
Status Sistem
</p>
<p className="mt-2 text-3xl font-black text-emerald-600">Aman</p>
<p className="text-xs text-slate-500">online</p>
</div>
</section>
</main>
</div>
)
}