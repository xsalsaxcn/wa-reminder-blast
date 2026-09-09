// NOTIVA_PATCH_07_SAFE_JOTFORM_LIVE_READ_ONLY_V1
import {
  NOTIVA_AI_TIMEZONE,
  requireAiReadToken,
  requireReadOnlyMethod,
  setReadOnlyHeaders
} from '../../../lib/notivaAiReadOnly'

export default async function handler(req, res) {
  setReadOnlyHeaders(res)

  if (!requireReadOnlyMethod(req, res)) return
  if (!requireAiReadToken(req, res)) return

  return res.status(200).json({
    success: true,
    read_only: true,
    service: 'Notiva AI Live Read-Only API',
    status: 'ready',
    timezone: NOTIVA_AI_TIMEZONE,
    generated_at: new Date().toISOString(),
    safe_answer: 'Koneksi Jotform ke Notiva read-only API aktif.'
  })
}
