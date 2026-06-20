import { useEffect, useState } from 'react'
import Sidebar from '../../components/Sidebar'

const emptyForm = {
  username: '',
  password: '',
  role: 'agent',
  is_active: true
}

export default function ManageUsersPage() {
  const [currentUser, setCurrentUser] = useState(null)
  const [users, setUsers] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const allowedRoles =
    currentUser?.role === 'master'
      ? ['master', 'admin']
      : ['user', 'agent']

  async function loadCurrentUser() {
    try {
      const response = await fetch('/api/auth/me?t=' + Date.now(), {
        cache: 'no-store'
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setCurrentUser(data.user)
      }
    } catch (err) {
      console.error(err)
    }
  }

  async function loadUsers() {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/admin/users/list?t=' + Date.now(), {
        cache: 'no-store'
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal memuat users')
      }

      setUsers(data.users || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function saveUser(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      if (!form.username.trim()) {
        throw new Error('Username wajib diisi')
      }

      if (!form.password.trim()) {
        throw new Error('Password wajib diisi')
      }

      if (!allowedRoles.includes(form.role)) {
        throw new Error('Role tidak diizinkan')
      }

      const response = await fetch('/api/admin/users/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(form)
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal membuat user')
      }

      setForm(emptyForm)
      await loadUsers()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleUser(user) {
    const ok = window.confirm(
      `${user.is_active ? 'Nonaktifkan' : 'Aktifkan'} user ${user.username}?`
    )

    if (!ok) return

    setError('')

    try {
      const response = await fetch('/api/admin/users/update-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: user.id,
          is_active: !user.is_active
        })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal update user')
      }

      await loadUsers()
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    loadCurrentUser()
    loadUsers()
  }, [])

  return (
    <div className="min-h-screen bg-slate-100 md:flex">
      <Sidebar user={currentUser} />

      <main className="flex-1 p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Manage Users</h1>
              <p className="text-sm text-slate-500">
                Tambah admin, user, dan agent operasional.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Agent hanya dapat mengakses Reminder, WhatsApp Blast, Job Queue, Job Performance, dan Logs.
              </p>
            </div>

            <button
              onClick={loadUsers}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Refresh
            </button>
          </div>

          {error ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <form
              onSubmit={saveUser}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-1"
            >
              <h2 className="font-semibold text-slate-900">Tambah User</h2>
              <p className="mt-1 text-xs text-slate-500">
                Buat akun agent untuk operator blast/reminder.
              </p>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
                    Username
                  </label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="contoh: agent1"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
                    Password
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Minimal 6 karakter"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
                    Role
                  </label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  >
                    {allowedRoles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  />
                  Active
                </label>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-slate-300"
                >
                  {saving ? 'Saving...' : 'Create User'}
                </button>
              </div>
            </form>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
              <h2 className="font-semibold text-slate-900">User List</h2>
              <p className="mt-1 text-xs text-slate-500">
                Total: {users.length}
              </p>

              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>Username</Th>
                      <Th>Role</Th>
                      <Th>Status</Th>
                      <Th>Created</Th>
                      <Th>Action</Th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {loading ? (
                      <tr>
                        <td colSpan="5" className="p-4 text-slate-500">
                          Loading...
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="p-4 text-slate-500">
                          Belum ada user.
                        </td>
                      </tr>
                    ) : (
                      users.map((user) => (
                        <tr key={user.id} className="hover:bg-slate-50">
                          <Td>{user.username}</Td>
                          <Td>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                              {user.role}
                            </span>
                          </Td>
                          <Td>
                            <span
                              className={
                                user.is_active
                                  ? 'rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-200'
                                  : 'rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200'
                              }
                            >
                              {user.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </Td>
                          <Td>
                            {user.created_at
                              ? new Date(user.created_at).toLocaleString('id-ID')
                              : '-'}
                          </Td>
                          <Td>
                            {user.role === 'master' && currentUser?.role !== 'master' ? (
                              <span className="text-xs text-slate-400">Locked</span>
                            ) : (
                              <button
                                onClick={() => toggleUser(user)}
                                className={
                                  user.is_active
                                    ? 'rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100'
                                    : 'rounded-lg bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100'
                                }
                              >
                                {user.is_active ? 'Disable' : 'Enable'}
                              </button>
                            )}
                          </Td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-800">
                <b>Role agent:</b> hanya untuk operator. Agent tidak akan melihat menu admin, inbox,
                analysis, usage, blacklist, atau quick replies.
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function Th({ children }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </th>
  )
}

function Td({ children }) {
  return <td className="px-4 py-3 text-slate-700">{children}</td>
}