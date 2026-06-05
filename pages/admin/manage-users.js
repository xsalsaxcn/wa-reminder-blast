import { useState } from 'react'
import AppLayout from '../../components/AppLayout'
import DataTable from '../../components/DataTable'

export default function ManageUsers() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  async function addUser() {
    const res = await fetch('/api/admin/add-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await res.json()
    alert(data.message || 'Request selesai.')
  }

  return (
    <AppLayout title="Manage Users">
      <div className="mb-6">
        <h2 className="text-3xl font-bold tracking-tight text-[#172033]">Manage Users</h2>
        <p className="mt-2 text-sm text-[#718096]">Master user dapat membuat akun operator.</p>
      </div>

      <div className="medical-card mb-6 rounded-[28px] p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label>
            <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-[#718096]">Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} className="h-12 w-full rounded-2xl border border-[#e7ecf5] px-4 text-sm outline-none focus:ring-4 focus:ring-[#eeeefe]" placeholder="operator01" />
          </label>
          <label>
            <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-[#718096]">Password</span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="h-12 w-full rounded-2xl border border-[#e7ecf5] px-4 text-sm outline-none focus:ring-4 focus:ring-[#eeeefe]" placeholder="••••••••" />
          </label>
          <button onClick={addUser} className="h-12 rounded-2xl bg-[#6d5dfc] px-6 text-sm font-bold text-white shadow-lg shadow-indigo-100 hover:bg-[#5847ee]">
            Tambah User
          </button>
        </div>
      </div>

      <DataTable columns={[{ key: 'username', label: 'Username' }, { key: 'role', label: 'Role' }, { key: 'status', label: 'Status' }]} rows={[]} emptyText="Belum ada user yang ditampilkan." />
    </AppLayout>
  )
}
