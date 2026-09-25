# Notiva Vaccination Queue Bridge V1.1 — Rebased 2026-09-25

Endpoint transactional baru:

`/api/internal/vaccination-queue-call`

Bridge ini sengaja **tidak memakai** Blast, Template Blast, `send_jobs`, `send_job_items`, cron, worker, scheduler, atau Manual Run.

## Baseline yang dipakai

V1.1 direbase terhadap baseline aktual yang dikumpulkan dari project lokal Notiva pada 2026-09-25 14:12.
Runner menerima working tree yang memang sudah memiliki perubahan lokal, tetapi mengunci seluruh tracked file existing agar byte-nya tidak berubah selama apply/build. Runner hanya men-stage dua file baru bridge ini.

## Environment Notiva

Tambahkan di deployment Notiva:

- `VACCINATION_QUEUE_INTERNAL_SECRET` — secret panjang/random khusus Vaccination -> Notiva.
- `VACCINATION_QUEUE_TEMPLATE_NAME` — nama template Meta yang sudah APPROVED.
- `VACCINATION_QUEUE_TEMPLATE_LANGUAGE` — opsional, default `id`.

Environment Meta existing tetap dipakai melalui `lib/whatsappTemplateSender.js`; file sender existing **tidak diubah**.

## Template

Direkomendasikan category `UTILITY`, tanpa media header.

Parameter body:

1. `{{1}}` = nama peserta
2. `{{2}}` = nomor antrean
3. `{{3}}` = nama session/event, bila template memakai parameter ketiga

Contoh dua parameter:

`Halo {{1}}, nomor antrean {{2}} Anda sudah dipanggil. Silakan menuju area vaksinasi sekarang.`

## Health check

GET `/api/internal/vaccination-queue-call`

Header:

`x-vaccination-queue-secret: <secret>`

Response sukses mengembalikan nama template, language, status approval, category, header type, dan jumlah placeholder.

## Kirim panggilan

POST JSON:

```json
{
  "phone": "081234567890",
  "participant_name": "Ina",
  "queue_number": "Q-0019",
  "session_name": "Vaksinasi Karyawan"
}
```

Header:

`x-vaccination-queue-secret: <secret>`

Jika sukses:

- langsung mengirim approved Meta template melalui sender Notiva existing;
- menulis `send_delivery_logs` dengan channel `vaccination_queue`;
- menulis `wa_outgoing_messages` agar histori outgoing tersedia di Inbox;
- mengembalikan `meta_message_id` ke caller;
- webhook Meta existing tetap menangani status sent/delivered/read/failed.

## Safety lock

Patch hanya ADD:

- `pages/api/internal/vaccination-queue-call.js`
- `docs/NOTIVA_VACCINATION_QUEUE_BRIDGE_V1_1.md`

Tidak mengubah:

- `package.json` / `package-lock.json`
- `lib/whatsappTemplateSender.js`
- `lib/sendDeliveryLog.js`
- webhook Meta
- Inbox
- Template Blast / Manual Run
- Reminder
- worker / cron / scheduler
- database schema

Tidak ada SQL baru.
