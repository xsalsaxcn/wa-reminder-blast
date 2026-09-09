// NOTIVA_PATCH_07_SAFE_JOTFORM_LIVE_READ_ONLY_V1
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import {
  cleanPhone,
  cleanText,
  phoneVariants,
  readInput,
  requireAiReadToken,
  requireReadOnlyMethod,
  setReadOnlyHeaders
} from '../../../lib/notivaAiReadOnly'

export default async function handler(req, res) {
  setReadOnlyHeaders(res)

  if (!requireReadOnlyMethod(req, res)) return
  if (!requireAiReadToken(req, res)) return

  try {
    const inputPhone = readInput(req, ['phone', 'nomor', 'wa'])
    const phone = cleanPhone(inputPhone)

    if (!phone) {
      return res.status(400).json({
        success: false,
        read_only: true,
        message: 'Parameter phone wajib diisi.'
      })
    }

    const variants = phoneVariants(phone)

    const [contactsResult, itemsResult] = await Promise.all([
      supabaseAdmin
        .from('contacts')
        .select('id, name, phone, database_id, status, created_at')
        .in('phone', variants)
        .limit(20),
      supabaseAdmin
        .from('send_job_items')
        .select('id, job_id, phone, status, template_name, template_language, scheduled_at, processed_at, sent_at, created_at, updated_at, error_message')
        .in('phone', variants)
        .order('created_at', { ascending: false })
        .limit(20)
    ])

    if (contactsResult.error) throw contactsResult.error
    if (itemsResult.error) throw itemsResult.error

    const items = itemsResult.data || []
    const jobIds = Array.from(new Set(items.map((item) => cleanText(item.job_id)).filter(Boolean)))
    const jobs = new Map()

    if (jobIds.length) {
      const jobsResult = await supabaseAdmin
        .from('send_jobs')
        .select('id, name, title, type, status, campaign_type, project_name, batch_name, created_at, updated_at')
        .in('id', jobIds.slice(0, 20))

      if (jobsResult.error) throw jobsResult.error
      for (const job of jobsResult.data || []) jobs.set(String(job.id), job)
    }

    const recentCampaigns = items.slice(0, 5).map((item) => {
      const job = jobs.get(String(item.job_id)) || {}
      return {
        job_id: item.job_id || null,
        campaign_name: cleanText(job.name || job.title),
        campaign_type: cleanText(job.campaign_type || job.type),
        project_name: cleanText(job.project_name),
        batch_name: cleanText(job.batch_name),
        template_name: cleanText(item.template_name),
        template_language: cleanText(item.template_language),
        status: cleanText(item.status),
        scheduled_at: item.scheduled_at || null,
        processed_at: item.processed_at || null,
        sent_at: item.sent_at || null,
        created_at: item.created_at || null,
        error: cleanText(item.error_message)
      }
    })

    const contact = (contactsResult.data || [])[0] || null
    const latest = recentCampaigns[0] || null

    return res.status(200).json({
      success: true,
      read_only: true,
      phone,
      contact: contact
        ? {
            name: cleanText(contact.name),
            status: cleanText(contact.status),
            database_id: contact.database_id || null
          }
        : null,
      latest_campaign: latest,
      recent_campaigns: recentCampaigns,
      generated_at: new Date().toISOString(),
      safe_answer: latest
        ? `Nomor ${phone} terakhir terkait campaign ${latest.campaign_name || latest.job_id || '-'} dengan template ${latest.template_name || 'tanpa template'} dan status ${latest.status || '-'}.`
        : `Belum ditemukan riwayat campaign/template untuk nomor ${phone}.`
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      read_only: true,
      message: error.message || 'Gagal membaca konteks nomor.'
    })
  }
}
