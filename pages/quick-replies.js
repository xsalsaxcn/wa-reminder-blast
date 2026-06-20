import { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar'

const emptyForm = {
  id: '',
  label: '',
  question: '',
  answer: '',
  category: 'General',
  sort_order: 0,
  is_active: true
}

export default function QuickRepliesPage() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function loadTemplates() {
    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      params.set('t', Date.now())

      const response = await fetch('/api/quick-replies/list?' + params.toString(), {
        cache: 'no-store'
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal memuat quick replies')
      }

      setRows(data.rows || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function saveTemplate(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const response = await fetch('/api/quick-replies/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(form)
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal menyimpan template')
      }

      setForm(emptyForm)
      await loadTemplates()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteTemplate(row) {
    const ok = window.confirm(`Hapus template "${row.label}"?`)
    if (!ok) return

    setError('')

    try {
      const response = await fetch('/api/quick-replies/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: row.id
        })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal menghapus template')
      }

      if (form.id === row.id) {
        setForm(emptyForm)
      }

      await loadTemplates()
    } catch (err) {
      setError(err.message)
    }
  }

  function editTemplate(row) {
    setForm({
      id: row.id,
      label: row.label || '',
      question: row.question || '',
      answer: row.answer || '',
      category: row.category || 'General',
      sort_order: Number(row.sort_order || 0),
      is_active: Boolean(row.is_active)
    })

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function duplicateTemplate(row) {
    setForm({
      id: '',
      label: `${row.label || 'Template'} Copy`,
      question: row.question || '',
      answer: row.answer || '',
      category: row.category || 'General',
      sort_order: Number(row.sort_order || 0) + 1,
      is_active: true
    })

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  return (
    <div className="min-h-screen bg-slate-100 md:flex">
      <Sidebar />

      <main className="flex-1 p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Quick Reply Templates</h1>
              <p className="text-sm text-slate-500">
                Buat QnA / template balasan yang akan muncul di Inbox.
              </p>
            </div>

            <button
              onClick={loadTemplates}
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

          <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <form
              onSubmit={saveTemplate}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-1"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-900">
                    {form.id ? 'Edit Template' : 'Tambah Template'}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Template ini akan tampil di bagian Quick Reply Inbox.
                  </p>
                </div>

                {form.id ? (
                  <button
                    type="button"
                    onClick={() => setForm(emptyForm)}
                    className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                  >
                    New
                  </button>
                ) : null}
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
                    Nama Button / Label
                  </label>
                  <input
                    type="text"
                    value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                    placeholder="Contoh: Pricelist MCU"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
                    Pertanyaan / Trigger QnA
                  </label>
                  <input
                    type="text"
                    value={form.question}
                    onChange={(e) => setForm({ ...form, question: e.target.value })}
                    placeholder="Contoh: Customer minta harga"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
                    Isi Jawaban / Template Balasan
                  </label>
                  <textarea
                    value={form.answer}
                    onChange={(e) => setForm({ ...form, answer: e.target.value })}
                    placeholder="Tulis isi balasan WhatsApp..."
                    rows={8}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">
                      Category
                    </label>
                    <input
                      type="text"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      placeholder="General"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">
                      Urutan
                    </label>
                    <input
                      type="number"
                      value={form.sort_order}
                      onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  />
                  Aktif / tampil di Inbox
                </label>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-slate-300"
                >
                  {saving ? 'Saving...' : form.id ? 'Update Template' : 'Add Template'}
                </button>
              </div>
            </form>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">Template List</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Total: {rows.length}
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Cari template..."
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm md:w-72"
                  />

                  <button
                    onClick={loadTemplates}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                  >
                    Search
                  </button>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>Order</Th>
                      <Th>Label</Th>
                      <Th>Question</Th>
                      <Th>Category</Th>
                      <Th>Status</Th>
                      <Th>Action</Th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {loading ? (
                      <tr>
                        <td colSpan="6" className="p-4 text-slate-500">
                          Loading...
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="p-4 text-slate-500">
                          Belum ada template.
                        </td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50">
                          <Td>{row.sort_order}</Td>
                          <Td>
                            <div className="font-semibold text-slate-900">
                              {row.label}
                            </div>
                            <div className="mt-1 max-w-xs truncate text-xs text-slate-500" title={row.answer}>
                              {row.answer}
                            </div>
                          </Td>
                          <Td>{row.question || '-'}</Td>
                          <Td>{row.category || '-'}</Td>
                          <Td>
                            <span
                              className={
                                row.is_active
                                  ? 'rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-200'
                                  : 'rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200'
                              }
                            >
                              {row.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </Td>
                          <Td>
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => editTemplate(row)}
                                className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                              >
                                Edit
                              </button>

                              <button
                                onClick={() => duplicateTemplate(row)}
                                className="rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                Copy
                              </button>

                              <button
                                onClick={() => deleteTemplate(row)}
                                className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                              >
                                Delete
                              </button>
                            </div>
                          </Td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-800">
                <b>Tips:</b> gunakan field Question sebagai catatan trigger, misalnya
                “Customer tanya harga”, “Customer minta jadwal”, atau “Customer komplain”.
                Button di Inbox akan memakai field Label, dan isi balasan memakai field Answer.
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