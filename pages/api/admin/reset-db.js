export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  return res.status(200).json({
    message: 'Reset DB skeleton berhasil. Sambungkan Supabase service role untuk reset data asli.',
  })
}
