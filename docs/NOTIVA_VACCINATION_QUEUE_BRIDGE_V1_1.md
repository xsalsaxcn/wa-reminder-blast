# Notiva Vaccination Queue Bridge V1.2 — Prepare + Called

Endpoint transactional tetap:

`/api/internal/vaccination-queue-call`

V1.2 mempertahankan mode `called` dari V1.1 dan menambahkan mode `prepare`
untuk notifikasi saat peserta tinggal 1 antrean sebelum gilirannya.

Bridge tetap tidak masuk Blast, Template Blast, send_jobs, send_job_items,
cron, worker, scheduler, Reminder, atau Manual Run.

## Environment

Existing:
- `VACCINATION_QUEUE_INTERNAL_SECRET`
- `VACCINATION_QUEUE_TEMPLATE_NAME` = template called
- `VACCINATION_QUEUE_TEMPLATE_LANGUAGE` = `id` (default)

Prepare:
- `VACCINATION_QUEUE_PREPARE_TEMPLATE_NAME` = `vaccination_queue_prepare`

`VACCINATION_QUEUE_PREPARE_TEMPLATE_NAME` opsional karena V1.2 default ke
`vaccination_queue_prepare`.

Kedua template harus ada di `wa_templates` dan status `APPROVED`.

## POST prepare

```json
{
  "phone": "081234567890",
  "participant_name": "Ina",
  "queue_number": "Q-0019",
  "notification_type": "prepare"
}
```

Template prepare:
- `{{1}}` = nama peserta
- `{{2}}` = nomor antrean

Contoh body:
`Halo {{1}}, nomor antrean {{2}} Anda akan segera dipanggil. Saat ini tinggal 1 antrean lagi sebelum giliran Anda. Mohon bersiap dan menuju area vaksinasi.`

## POST called

Tetap backward-compatible. Jika `notification_type` tidak dikirim, default = `called`.

```json
{
  "phone": "081234567890",
  "participant_name": "Ina",
  "queue_number": "Q-0019",
  "notification_type": "called"
}
```

## Health check

GET `/api/internal/vaccination-queue-call`

V1.2 mengembalikan dua template:
- `templates.called`
- `templates.prepare`

## Safety scope V1.2

Hanya memodifikasi:
- `pages/api/internal/vaccination-queue-call.js`
- `docs/NOTIVA_VACCINATION_QUEUE_BRIDGE_V1_1.md`

Tidak mengubah:
- `package.json` / `package-lock.json`
- `lib/whatsappTemplateSender.js`
- `lib/sendDeliveryLog.js`
- `lib/supabaseAdmin.js`
- webhook Meta
- Inbox
- Blast / Template Blast / Manual Run
- Reminder
- worker / cron / scheduler
- database schema

Tidak ada SQL baru.
