export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  return res.status(200).json({
    message: 'Reminder skeleton berhasil dijalankan. Sambungkan Supabase dan Meta WhatsApp API untuk pengiriman asli.',
  })
}
