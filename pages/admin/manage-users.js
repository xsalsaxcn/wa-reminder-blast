import { useEffect, useState } from 'react'
import AppLayout from '../../components/AppLayout'

export default function ManageUsersPage() {
  const [users, setUsers] = useState([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('user')
  const [message, setMessage] = useState('')

  async function loadUsers() {
    const res = await fetch('/api/admin/users')
    const json = await res.json()
    setUsers(json.data || [])
  }

  async function addUser(e) {
    e.preventDefault()
    setMessage('')

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role })
    })

    const json = await res.json()
    setMessage(json.message || 'Selesai')

    if (json.success) {
      setUsername('')
      setPassword('')
      setRole('user')
      loadUsers()
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Manage Users</h1>
          <p className="mt-2 text-slate-500">Kelola user aplikasi.</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Tambah User</h2>

          <form onSubmit={addUser} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
              <option value="master">Master</option>
            </select>
            <button className="rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700">
              Tambah User
            </button>
          </form>

          {message && <p className="mt-4 text-sm font-semibold text-slate-700">{message}</p>}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Daftar User</h2>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-3">Username</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="py-3 font-semibold">{item.username}</td>
                    <td>{item.role}</td>
                    <td>{item.is_active ? 'Active' : 'Inactive'}</td>
                    <td>{new Date(item.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
