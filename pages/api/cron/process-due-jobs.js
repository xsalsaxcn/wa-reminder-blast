function cleanText(value) {
  return String(value || '').trim()
}

async function readJsonOrText(response) {
  const text = await response.text()

  try {
    return JSON.parse(text)
  } catch (err) {
    return {
      success: response.ok,
      raw: text
    }
  }
}

function getBaseUrl(req) {
  const host = req.headers.host
  const proto = req.headers['x-forwarded-proto'] || 'https'

  return `${proto}://${host}`
}

async function callProcessor(req, path) {
  const baseUrl = getBaseUrl(req)
  const workerSecret = cleanText(process.env.WORKER_SECRET)

  const headers = {
    Accept: 'application/json'
  }

  if (workerSecret) {
    headers['x-worker-secret'] = workerSecret
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers
  })

  const data = await readJsonOrText(response)

  return {
    ok: response.ok,
    status: response.status,
    path,
    data
  }
}

function isAuthorized(req) {
  const cronSecret = cleanText(process.env.CRON_SECRET)

  if (!cronSecret) return true

  const authHeader = cleanText(req.headers.authorization)
  const querySecret = cleanText(req.query.secret)

  if (authHeader === `Bearer ${cronSecret}`) return true
  if (querySecret === cronSecret) return true

  return false
}

function numberFrom(data, key) {
  return Number(data?.[key] || 0)
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      })
    }

    if (!isAuthorized(req)) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized cron request.'
      })
    }

    // Template Blast dibuat MANUAL-ONLY. Cron tidak boleh lagi melanjutkan
    // job template lama/pending secara otomatis. Attachment/text flow tetap sama.
    const templateResult = {
      ok: true,
      status: 200,
      path: null,
      data: {
        success: true,
        skipped: true,
        message: 'Template auto processing dinonaktifkan. Gunakan Manual Run di Job Performance.',
        processed: 0,
        sent: 0,
        failed: 0,
        future_items: 0
      }
    }

    const attachmentResult = await callProcessor(
      req,
      '/api/jobs/process-attachment-next?limit=10'
    )

    const textResult = await callProcessor(
      req,
      '/api/jobs/process-next?limit=10'
    )

    const templateData = templateResult.data || {}
    const attachmentData = attachmentResult.data || {}
    const textData = textResult.data || {}

    const processed =
      numberFrom(templateData, 'processed') +
      numberFrom(attachmentData, 'processed') +
      numberFrom(textData, 'processed')

    const sent =
      numberFrom(templateData, 'sent') +
      numberFrom(attachmentData, 'sent') +
      numberFrom(textData, 'sent')

    const failed =
      numberFrom(templateData, 'failed') +
      numberFrom(attachmentData, 'failed') +
      numberFrom(textData, 'failed')

    const futureItems =
      numberFrom(templateData, 'future_items') +
      numberFrom(attachmentData, 'future_items') +
      numberFrom(textData, 'future_items')

    return res.status(200).json({
      success: true,
      message: 'Cron process due jobs selesai.',
      mode: 'scheduled',
      processed,
      sent,
      failed,
      future_items: futureItems,
      template: templateResult,
      attachment: attachmentResult,
      text: textResult,
      executed_at: new Date().toISOString()
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Cron process due jobs gagal.'
    })
  }
}