

const META_API_VERSION = process.env.META_API_VERSION || 'v20.0'
const META_WA_TOKEN = process.env.META_WA_TOKEN
const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID

function cleanText(value) {
return String(value || '').trim()
}

function cleanPhone(value) {
let phone = String(value || '').trim()

if (phone.startsWith('="')) {
phone = phone.slice(2)
}

if (phone.endsWith('"')) {
phone = phone.slice(0, -1)
}

if (phone.startsWith("'")) {
phone = phone.slice(1)
}

let result = ''

for (const char of phone) {
if ('0123456789'.includes(char)) {
result += char
}
}

if (result.startsWith('0')) {
result = '62' + result.slice(1)
}

return result
}

function getMetaBaseUrl() {
return 'https://graph.facebook.com/' + META_API_VERSION + '/' + META_PHONE_NUMBER_ID
}

function assertMetaConfig() {
if (!META_WA_TOKEN) {
throw new Error('META_WA_TOKEN belum diset.')
}

if (!META_PHONE_NUMBER_ID) {
throw new Error('META_PHONE_NUMBER_ID belum diset.')
}
}

function guessMimeTypeFromUrl(url) {
const text = String(url || '').toLowerCase()

if (text.includes('.jpg') || text.includes('.jpeg')) return 'image/jpeg'
if (text.includes('.png')) return 'image/png'
if (text.includes('.webp')) return 'image/webp'
if (text.includes('.pdf')) return 'application/pdf'
if (text.includes('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
if (text.includes('.doc')) return 'application/msword'
if (text.includes('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
if (text.includes('.xls')) return 'application/vnd.ms-excel'

return 'application/octet-stream'
}

function normalizeAttachmentType(value, mimeType) {
const type = cleanText(value).toLowerCase()

if (type === 'image') return 'image'
if (type === 'document') return 'document'

if (String(mimeType || '').startsWith('image/')) return 'image'

return 'document'
}

function guessFileName(url, fallback) {
const fallbackName = cleanText(fallback) || 'attachment'

try {
const parsed = new URL(url)
const parts = parsed.pathname.split('/')
const last = parts[parts.length - 1]

if (last) {
return decodeURIComponent(last)
}
} catch (err) {
return fallbackName
}

return fallbackName
}

async function readResponseAsJson(response) {
const text = await response.text()

try {
return JSON.parse(text)
} catch (err) {
return {
error: {
message: text || 'Response Meta tidak valid.'
}
}
}
}

async function downloadAttachment(attachmentUrl) {
const response = await fetch(attachmentUrl, {
method: 'GET',
headers: {
'User-Agent': 'Notiva-WA-Automation/1.0'
}
})

if (!response.ok) {
throw new Error('Gagal download attachment: HTTP ' + response.status)
}

const arrayBuffer = await response.arrayBuffer()
const buffer = Buffer.from(arrayBuffer)
const mimeType = response.headers.get('content-type') || guessMimeTypeFromUrl(attachmentUrl)

if (!buffer.length) {
throw new Error('Attachment kosong.')
}

return {
buffer,
mimeType
}
}

async function uploadMediaToMeta({ attachmentUrl, attachmentFilename, attachmentType }) {
assertMetaConfig()

const downloaded = await downloadAttachment(attachmentUrl)
const mimeType = downloaded.mimeType || guessMimeTypeFromUrl(attachmentUrl)
const fileName = guessFileName(attachmentUrl, attachmentFilename)
const type = normalizeAttachmentType(attachmentType, mimeType)

const formData = new FormData()

formData.append('messaging_product', 'whatsapp')
formData.append('type', mimeType)

const blob = new Blob([downloaded.buffer], {
type: mimeType
})

formData.append('file', blob, fileName)

const response = await fetch(getMetaBaseUrl() + '/media', {
method: 'POST',
headers: {
Authorization: 'Bearer ' + META_WA_TOKEN
},
body: formData
})

const data = await readResponseAsJson(response)

if (!response.ok || !data.id) {
throw new Error(data?.error?.message || 'Upload media ke Meta gagal.')
}

return {
media_id: data.id,
mime_type: mimeType,
filename: fileName,
attachment_type: type
}
}

async function sendWhatsAppText({ to, message }) {
assertMetaConfig()

const phone = cleanPhone(to)
const body = cleanText(message)

if (!phone) {
throw new Error('Nomor tujuan kosong.')
}

if (!body) {
throw new Error('Pesan kosong.')
}

const payload = {
messaging_product: 'whatsapp',
to: phone,
type: 'text',
text: {
preview_url: true,
body
}
}

const response = await fetch(getMetaBaseUrl() + '/messages', {
method: 'POST',
headers: {
Authorization: 'Bearer ' + META_WA_TOKEN,
'Content-Type': 'application/json'
},
body: JSON.stringify(payload)
})

const data = await readResponseAsJson(response)

if (!response.ok) {
throw new Error(data?.error?.message || 'Kirim text WhatsApp gagal.')
}

return {
success: true,
mode: 'text',
meta_message_id: data?.messages?.[0]?.id || null,
response: data
}
}

async function sendWhatsAppMedia({
to,
message,
attachment_url,
attachment_type,
attachment_filename,
attachment_caption
}) {
assertMetaConfig()

const phone = cleanPhone(to)

if (!phone) {
throw new Error('Nomor tujuan kosong.')
}

if (!attachment_url) {
throw new Error('attachment_url kosong.')
}

const uploaded = await uploadMediaToMeta({
attachmentUrl: attachment_url,
attachmentFilename: attachment_filename,
attachmentType: attachment_type
})

const caption = cleanText(attachment_caption) || cleanText(message) || ''
const mediaType = normalizeAttachmentType(attachment_type, uploaded.mime_type)

let payload = {
messaging_product: 'whatsapp',
to: phone,
type: mediaType
}

if (mediaType === 'image') {
payload.image = {
id: uploaded.media_id
}

if (caption) {
payload.image.caption = caption
}
} else {
payload.document = {
id: uploaded.media_id,
filename: cleanText(attachment_filename) || uploaded.filename || 'attachment'
}

if (caption) {
payload.document.caption = caption
}
}

const response = await fetch(getMetaBaseUrl() + '/messages', {
method: 'POST',
headers: {
Authorization: 'Bearer ' + META_WA_TOKEN,
'Content-Type': 'application/json'
},
body: JSON.stringify(payload)
})

const data = await readResponseAsJson(response)

if (!response.ok) {
throw new Error(data?.error?.message || 'Kirim media WhatsApp gagal.')
}

return {
success: true,
mode: 'media',
uploaded_media_id: uploaded.media_id,
meta_message_id: data?.messages?.[0]?.id || null,
response: data
}
}

async function sendWhatsAppMessage(params) {
const attachmentUrl = cleanText(params?.attachment_url)

if (attachmentUrl) {
return sendWhatsAppMedia({
to: params.to || params.phone,
message: params