

import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRole } from '../../../lib/auth'

export default async function handler(req, res) {
res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
res.setHeader('Pragma', 'no-cache')
res.setHeader('Expires', '0')

try {
await requireRole(req, res, ['master', 'admin', 'user', 'agent'])

if (req.method !== 'GET') {
return res.status(405).json({
success: false,
message: 'Method not allowed'
})
}

const type = String(req.query.type || '').trim().toLowerCase()

let query = supabaseAdmin
.from('contact_databases')
.select('*')
.order('created_at', { ascending: false })
.limit(500)

if (type === 'blast' || type === 'reminder') {
query = query.eq('type', type)
}

const { data, error } = await query

if (error) {
return res.status(500).json({
success: false,
message: error.message
})
}

return res.status(200).json({
success: true,
data: data || [],
databases: data || []
})
} catch (error) {
return res.status(401).json({
success: false,
message: error.message || 'Unauthorized'
})
}
}