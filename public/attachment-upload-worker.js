

function uploadFile(file, fileName, mimeType) {
var xhr = new XMLHttpRequest()

xhr.open('POST', '/api/attachments/upload-raw', true)
xhr.timeout = 30000
xhr.withCredentials = true

xhr.setRequestHeader('Content-Type', mimeType)
xhr.setRequestHeader('x-file-name', encodeURIComponent(fileName || 'attachment'))

xhr.upload.onprogress = function (event) {
if (event.lengthComputable) {
var percent = Math.round((event.loaded / event.total) * 100)

self.postMessage({
type: 'upload-progress',
percent: percent
})
}
}

xhr.onload = function () {
var data = null

try {
data = JSON.parse(xhr.responseText || '{}')
} catch (err) {
data = {
success: false,
message: xhr.responseText || 'Response upload tidak valid.'
}
}

if (xhr.status >= 200 && xhr.status < 300 && data.success) {
self.postMessage({
type: 'upload-success',
attachment: {
attachment_url: data.attachment_url,
attachment_type: data.attachment_type,
attachment_filename: data.attachment_filename
}
})

return
}

self.postMessage({
type: 'upload-error',
message: data.message || 'Upload attachment gagal.'
})
}

xhr.onerror = function () {
self.postMessage({
type: 'upload-error',
message: 'Upload gagal karena koneksi bermasalah.'
})
}

xhr.ontimeout = function () {
self.postMessage({
type: 'upload-error',
message: 'Upload attachment timeout setelah 30 detik.'
})
}

xhr.onabort = function () {
self.postMessage({
type: 'upload-error',
message: 'Upload attachment dibatalkan.'
})
}

xhr.send(file)
}

self.onmessage = function (event) {
var data = event.data || {}

if (data.type === 'upload') {
uploadFile(data.file, data.fileName, data.mimeType)
}
}