import { useEffect, useState } from 'react'
import AppLayout from '../../components/AppLayout'

const EMPTY_FORM = {
  id: '',
  code: '',
  name: '',
  brand_name: '',
  status: 'active',
  pic_name: '',
  pic_email: '',
  pic_phone: '',
  notes: ''
}

export default function ClientsPage() {
  const [clients, setClients] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function loadClients() {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/clients', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Gagal memuat clients.')
      setClients(data.clients || [])
    } catch (error) {
      setMessage(error.message || 'Gagal memuat clients.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadClients()
  }, [])

  function edit(client) {
    setForm({
      id: client.id || '',
      code: client.code || '',
      name: client.name || '',
      brand_name: client.brand_name || '',
      status: client.status || 'active',
      pic_name: client.pic_name || '',
      pic_email: client.pic_email || '',
      pic_phone: client.pic_phone || '',
      notes: client.notes || ''
    })
    setMessage('')
  }

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    try {
      const response = await fetch('/api/admin/clients', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Gagal menyimpan client.')

      setForm(EMPTY_FORM)
      setMessage(form.id ? 'Client berhasil diperbarui.' : 'Client berhasil dibuat.')
      await loadClients()
    } catch (error) {
      setMessage(error.message || 'Gagal menyimpan client.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-600">Master</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">Clients</h1>
          <p className="mt-2 text-sm text-slate-500">
            Master data tenant Notiva. Phase 1 belum mengubah Meta sender, webhook, Inbox, atau worker.
          </p>
        </div>

        {message ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 shadow-sm">
            {message}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
          <form onSubmit={save} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-slate-900">{form.id ? 'Edit Client' : 'Add Client'}</h2>
              {form.id ? (
                <button type="button" onClick={() => setForm(EMPTY_FORM)} className="text-xs font-bold text-cyan-700">
                  New
                </button>
              ) : null}
            </div>

            <div className="mt-5 space-y-4">
              <Field label="Code" value={form.code} disabled={form.code === 'IHC'} onChange={(value) => setForm({ ...form, code: value })} />
              <Field label="Company / Client Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
              <Field label="Brand Name" value={form.brand_name} onChange={(value) => setForm({ ...form, brand_name: value })} />
              <Field label="PIC Name" value={form.pic_name} onChange={(value) => setForm({ ...form, pic_name: value })} />
              <Field label="PIC Email" value={form.pic_email} onChange={(value) => setForm({ ...form, pic_email: value })} />
              <Field label="PIC Phone" value={form.pic_phone} onChange={(value) => setForm({ ...form, pic_phone: value })} />

              <div>
                <label className="text-xs font-black uppercase tracking-wide text-slate-500">Status</label>
                <select
                  value={form.status}
                  disabled={form.code === 'IHC'}
                  onChange={(event) => setForm({ ...form, status: event.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wide text-slate-500">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  rows={4}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </div>

              <button disabled={saving} className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50">
                {saving ? 'Saving...' : form.id ? 'Save Changes' : 'Create Client'}
              </button>
            </div>
          </form>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900">Client List</h2>
                <p className="mt-1 text-xs font-semibold text-slate-400">{clients.length} tenant</p>
              </div>
              <button type="button" onClick={loadClients} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">
                Refresh
              </button>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Code</Th><Th>Client</Th><Th>PIC</Th><Th>Status</Th><Th>Action</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clients.map((client) => (
                    <tr key={client.id}>
                      <Td><span className="font-black text-slate-900">{client.code}</span></Td>
                      <Td>
                        <p className="font-bold text-slate-900">{client.brand_name || client.name}</p>
                        <p className="text-xs text-slate-400">{client.name}</p>
                      </Td>
                      <Td>
                        <p>{client.pic_name || '-'}</p>
                        <p className="text-xs text-slate-400">{client.pic_email || client.pic_phone || '-'}</p>
                      </Td>
                      <Td>
                        <span className={client.status === 'active' ? 'rounded-full bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700' : 'rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-500'}>
                          {client.status}
                        </span>
                      </Td>
                      <Td><button type="button" onClick={() => edit(client)} className="font-black text-cyan-700">Edit</button></Td>
                    </tr>
                  ))}
                  {!loading && !clients.length ? (
                    <tr><Td colSpan={5}>Belum ada client.</Td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

function Field({ label, value, onChange, disabled = false }) {
  return (
    <div>
      <label className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</label>
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm disabled:bg-slate-100"
      />
    </div>
  )
}

function Th({ children }) {
  return <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-500">{children}</th>
}

function Td({ children, colSpan }) {
  return <td colSpan={colSpan} className="px-4 py-4 align-top text-slate-600">{children}</td>
}
