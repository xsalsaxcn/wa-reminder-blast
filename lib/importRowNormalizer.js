export function getValue(row, keys = []) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return row[key]
    }

    const foundKey = Object.keys(row || {}).find(
      (item) => item.trim().toLowerCase() === String(key).trim().toLowerCase()
    )

    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== '') {
      return row[foundKey]
    }
  }

  return ''
}

export function cleanPhone(phone) {
  return String(phone || '')
    .replace(/\D/g, '')
    .replace(/^0/, '62')
}

export function normalizeImportRow(row = {}) {
  const name = String(
    getValue(row, ['name', 'nama', 'customer_name', 'profile_name'])
  ).trim()

  const phone = cleanPhone(
    getValue(row, ['phone', 'nomor', 'no_hp', 'whatsapp', 'wa', 'number'])
  )

  const message = String(
    getValue(row, ['message', 'pesan', 'text', 'body'])
  ).trim()

  const reminderDate = String(
    getValue(row, ['reminder_date', 'tanggal', 'date', 'scheduled_at', 'send_at'])
  ).trim()

  const attachmentUrl = String(
    getValue(row, ['attachment_url', 'file_url', 'document_url', 'image_url', 'media_url', 'link_file'])
  ).trim()

  const attachmentType = String(
    getValue(row, ['attachment_type', 'file_type', 'media_type'])
  ).trim().toLowerCase()

  const attachmentFilename = String(
    getValue(row, ['attachment_filename', 'filename', 'file_name', 'nama_file'])
  ).trim()

  const attachmentCaption = String(
    getValue(row, ['attachment_caption', 'caption', 'file_caption'])
  ).trim()

  return {
    name,
    phone,
    message,
    reminder_date: reminderDate,
    attachment_url: attachmentUrl,
    attachment_type: attachmentType,
    attachment_filename: attachmentFilename,
    attachment_caption: attachmentCaption
  }
}