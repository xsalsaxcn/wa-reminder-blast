

import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

export const config = {
api: {
responseLimit: '2mb'
}
}

function cleanId(value) {
return String(value || '').trim()
}

export default async function handler(req, res) {
try {
if (req.method !== 'GET' && req.method !== 'HEAD') {
return res.status(405).send('Method not allowed')
}

const id = cleanId(req.query.id)

if (!id) {
return res.status(400).send('Missing attachment id')
}

const { data, error } = await supabaseAdmin
.from('wa_attachments')
.select('file_name, mime_type, size_bytes, data_base64')
.eq('id', id)
.single()

if (error || !data) {
return res.status(404).send('Attachment not found')
}

const buffer = Buffer.from(data.data_base64 || '', 'base64')
const safeFileName = String(data.file_name || 'attachment').replace(/"/g, '')

res.setHeader('Content-Type', data.mime_type || 'application/octet-stream')
res.setHeader('Content-Length', String(buffer.length))
res.setHeader('Content-Disposition', 'inline; filename="' + safeFileName + '"')
res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')

if (req.method === 'HEAD') {
return res.status(200).end()
}

return res.status(200).send(buffer)
} catch (error) {
return res.status(500).send(error.message || 'Attachment error')
}
}