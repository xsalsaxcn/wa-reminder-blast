import { useEffect, useState } from 'react'
import Sidebar from '../../components/Sidebar'

const verticalOptions = [
  'HEALTH',
  'OTHER',
  'AUTO',
  'BEAUTY',
  'APPAREL',
  'EDU',
  'ENTERTAIN',
  'EVENT_PLAN',
  'FINANCE',
  'GOVT',
  'GROCERY',
  'HOTEL',
  'NONPROFIT',
  'PROF_SERVICES',
  'RETAIL',
  'TRAVEL',
  'RESTAURANT'
]

const emptyForm = {
  about: '',
  address: '',
  description: '',
  email: '',
  websites: '',
  vertical: 'HEALTH'
}

export default function WabaProfilePage() {
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [preview, setPreview] = useState('')

  async function loadProfile() {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch('/api/admin/waba-profile/get?t=' + Date.now(), {
        cache: 'no-store'
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal memuat WABA profile')
      }

      const item = data.profile || {}

      setProfile(item)
      setForm({
        about: item.about || '',
        address: item.address || '',
        description: item.description || '',
        email: item.email || '',
        websites: Array.isArray(item.websites) ? item.websites.join('\n') : '',
        vertical: item.vertical || 'HEALTH'
      })
      setPreview(item.profile_picture_url || '')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function saveProfile(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch('/api/admin/waba-profile/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(form)
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal update WABA profile')
      }

      setSuccess('WABA profile berhasil diupdate.')
      await loadProfile()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function uploadPicture(e) {
    const file = e.target.files?.[0]

    if (!file) return

    setUploading(true)
    setError('')
    setSuccess('')

    try {
      if (!['image/jpeg', 'image/png'].includes(file.type)) {
        throw new Error('Format foto harus JPG atau PNG')
      }

      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Ukuran foto maksimal 5 MB')
      }

      const base64 = await fileToBase64(file)
      setPreview(base64)

      const response = await fetch('/api/admin/waba-profile/upload-picture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          base64
        })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal upload profile picture')
      }

      setSuccess('Foto profile WABA berhasil diupdate. Perubahan bisa butuh beberapa saat untuk tampil di WhatsApp.')
      await loadProfile()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  useEffect(() => {
    loadProfile()
  }, [])

  return (
    <div className="min-h-screen bg-slate-100 md:flex">
      <Sidebar />

      <main className="flex-1 p-4 md:p-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">WABA Profile</h1>
              <p className="text-sm text-slate-500">
                Kelola profil WhatsApp Business yang terlihat oleh customer.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Foto, about, deskripsi, email, website, dan kategori bisnis.
              </p>
            </div>

            <button
              onClick={loadProfile}
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

          {success ? (
            <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              {success}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
              <h2 className="font-semibold text-slate-900">Profile Picture</h2>
              <p className="mt-1 text-xs text-slate-500">
                Foto ini yang tampil sebagai profile WhatsApp Business.
              </p>

              <div className="mt-5 flex flex-col items-center">
                <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 shadow-sm">
                  {preview ? (
                    <img
                      src={preview}
                      alt="WABA Profile"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="text-center text-xs text-slate-400">
                      No Picture
                    </div>
                  )}
                </div>

                <label className="mt-5 inline-flex cursor-pointer rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
                  {uploading ? 'Uploading...' : 'Upload Foto Baru'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={uploadPicture}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>

                <p className="mt-3 text-center text-xs text-slate-400">
                  Gunakan foto square 1:1, JPG/PNG, maksimal 5 MB.
                </p>
              </div>
            </section>

            <form
              onSubmit={saveProfile}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2"
            >
              <h2 className="font-semibold text-slate-900">Business Info</h2>
              <p className="mt-1 text-xs text-slate-500">
                Data ini akan dikirim ke WhatsApp Business Profile API.
              </p>

              {loading ? (
                <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                  Loading profile...
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">
                      About
                    </label>
                    <input
                      type="text"
                      value={form.about}
                      onChange={(e) => setForm({ ...form, about: e.target.value })}
                      placeholder="Contoh: Klinik kesehatan dan layanan MCU"
                      maxLength={139}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      {form.about.length}/139 karakter
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">
                      Description
                    </label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Deskripsi bisnis"
                      rows={4}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">
                      Address
                    </label>
                    <textarea
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      placeholder="Alamat klinik / kantor"
                      rows={3}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-500">
                        Email
                      </label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="email@domain.com"
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-500">
                        Category / Vertical
                      </label>
                      <select
                        value={form.vertical}
                        onChange={(e) => setForm({ ...form, vertical: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      >
                        {verticalOptions.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">
                      Websites
                    </label>
                    <textarea
                      value={form.websites}
                      onChange={(e) => setForm({ ...form, websites: e.target.value })}
                      placeholder={'https://inharmonyclinic.com\nhttps://wa-reminder-blast.vercel.app'}
                      rows={3}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      Maksimal 2 website, pisahkan dengan baris baru.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-slate-300"
                  >
                    {saving ? 'Saving...' : 'Save WABA Profile'}
                  </button>
                </div>
              )}
            </form>
          </div>

          <div className="mt-4 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            <b>Catatan:</b> perubahan profile WABA kadang tidak langsung muncul di WhatsApp customer.
            Tunggu beberapa menit lalu cek dari nomor WhatsApp lain.
          </div>
        </div>
      </main>
    </div>
  )
}