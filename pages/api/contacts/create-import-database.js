

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

const body = req.body || {}

const databaseName = cleanText(body.databaseName || body.database_name || body.name)
const type = cleanText(body.type || 'blast').toLowerCase()

const defaultAttachmentUrl = cleanText(body.default_attachment_url)
const defaultAttachmentType = cleanText(body.default_attachment_type)
const defaultAttachmentFilename = cleanText(body.default_attachment_filename)
const defaultAttachmentCaption = cleanText(body.default_attachment_caption)

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

const insertData = {
name: databaseName,
type,
default_attachment_url: defaultAttachmentUrl || null,
default_attachment_type: defaultAttachmentType || null,
default_attachment_filename: defaultAttachmentFilename || null,
default_attachment_caption: defaultAttachmentCaption || null
}

const { data, error } = await supabaseAdmin
.from('contact_databases')
.insert(insertData)
.select(
'id, name, type, default_attachment_url, default_attachment_type, default_attachment_filename, default_attachment_caption, created_at'
)
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