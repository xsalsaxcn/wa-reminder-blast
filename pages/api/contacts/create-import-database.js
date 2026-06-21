

import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

function cleanText(value) {
return String(value || '').trim()
}

export default async function handler(req, res) {
res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
res.setHeader('Pragma', 'no-cache')
res.setHeader('Expires', '0')

try {
const authUser = requireRole(req, res, ['master', 'admin', 'user', 'agent'])
if (!authUser) return

if (req.method !== 'POST') {
return res.status(405).json({
success: false,
message: 'Method not allowed'
})
}

const databaseName = cleanText(req.body?.databaseName || req.body?.database_name || req.body?.name)
const type = cleanText(req.body?.type || 'blast').toLowerCase()

if (!databaseName) {
return res.status(400).json({
success: false,
message: 'Nama database wajib diisi.'
})
}

if (type !== 'blast' && type !== 'reminder') {
return res.status(400).json({
success: false,
message: 'Type harus blast atau reminder.'
})
}

const { data, error } = await supabaseAdmin
.from('contact_databases')
.insert({
name: databaseName,
type
})
.select('id, name, type, created_at')
.single()

if (error) {
return res.status(500).json({
success: false,
message: error.message
})
}

return res.status(200).json({
success: true,
database: data
})
} catch (error) {
return res.status(500).json({
success: false,
message: error.message || 'Gagal membuat database.'
})
}
}