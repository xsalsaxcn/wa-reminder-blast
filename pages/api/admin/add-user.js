import bcrypt from 'bcrypt'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { username, password } = req.body || {}
  if (!username || !password) return res.status(400).json({ message: 'Username dan password wajib diisi.' })

  const passwordHash = await bcrypt.hash(password, 10)

  return res.status(200).json({
    message: `User ${username} berhasil diproses secara skeleton. Sambungkan Supabase untuk menyimpan user.`,
    preview: { username, passwordHashLength: passwordHash.length },
  })
}
