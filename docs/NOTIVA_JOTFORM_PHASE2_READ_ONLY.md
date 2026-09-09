<!-- NOTIVA_PATCH_07_SAFE_JOTFORM_LIVE_READ_ONLY_V1 -->
# Notiva + Jotform AI Agent - Phase 2 Live Read-Only

Phase 2 memberi Jotform AI Agent akses **baca saja** ke ringkasan operasional Notiva. Tidak ada endpoint pada patch ini yang melakukan insert, update, delete, mengirim WhatsApp, menjalankan worker, atau mengubah konfigurasi.

## Endpoint

Base URL production contoh:

```text
https://wa-reminder-blast.vercel.app
```

Semua endpoint menerima `GET` atau `POST`, tetapi keduanya tetap **read-only**. POST disediakan agar Jotform dapat mengirim Request Data dinamis tanpa menjadikan URL dinamis.

| Tujuan | Endpoint | Input |
|---|---|---|
| Tes koneksi | `/api/ai-read/health` | tidak ada |
| Status campaign / alasan pending | `/api/ai-read/campaign-status` | `q` |
| Ringkasan reminder | `/api/ai-read/reminder-summary` | `date` opsional, `YYYY-MM-DD` |
| Template/campaign nomor tertentu | `/api/ai-read/contact-context` | `phone` |
| Unread Inbox | `/api/ai-read/inbox-summary` | tidak ada |

## Security token

Buat token acak minimal 32 byte. Contoh di CMD:

```cmd
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Tambahkan hasilnya ke Vercel Environment Variables:

```text
NOTIVA_AI_READ_TOKEN=<TOKEN_RAHASIA>
```

Redeploy Notiva setelah environment variable ditambahkan.

Jangan gunakan `NEXT_PUBLIC_` untuk token ini. Token harus tetap server-side.

## Header Jotform

Untuk setiap `Send API Request` action di Jotform tambahkan header:

```text
X-Notiva-AI-Token: <TOKEN_RAHASIA_YANG_SAMA>
Content-Type: application/json
```

Alternatif yang juga didukung oleh Notiva:

```text
Authorization: Bearer <TOKEN_RAHASIA>
```

## Action 1 - Campaign Status

**When / Agent Prompt**

```text
Jika admin menanyakan status campaign, kenapa campaign masih pending, berapa yang sent/failed/read/delivered, atau progress sebuah campaign, gunakan action ini. Minta nama campaign bila belum disebutkan. Jangan menebak status tanpa response API.
```

**Do**: Send API Request

```text
POST https://wa-reminder-blast.vercel.app/api/ai-read/campaign-status
```

Request Data:

```text
q = nama campaign atau job id dari percakapan
```

Contoh pertanyaan:

```text
Kenapa campaign Bundling P3Vi masih pending?
```

Gunakan `safe_answer`, `counts`, dan `assessment` dari response. Jika `alternative_matches` berisi campaign yang mirip dan hasil utama tampak tidak sesuai, minta admin memperjelas campaign.

## Action 2 - Reminder Summary

**Agent Prompt**

```text
Jika admin menanyakan jumlah reminder terkirim/gagal pada hari tertentu atau hari ini, gunakan action ini. Untuk hari ini, date boleh dikosongkan. Jangan menghitung dari ingatan atau knowledge base.
```

```text
POST https://wa-reminder-blast.vercel.app/api/ai-read/reminder-summary
```

Request Data:

```text
date = YYYY-MM-DD, opsional
```

Contoh:

```text
Berapa reminder gagal hari ini?
```

## Action 3 - Contact / Template Context

**Agent Prompt**

```text
Jika admin menanyakan template/campaign terakhir untuk sebuah nomor WhatsApp, gunakan action ini. Pastikan nomor disebutkan. Jangan mengarang nama template.
```

```text
POST https://wa-reminder-blast.vercel.app/api/ai-read/contact-context
```

Request Data:

```text
phone = nomor WhatsApp dari percakapan
```

Contoh:

```text
Template apa yang dipakai nomor 62812xxxx?
```

Endpoint ini sengaja tidak mengirim body chat customer ke Jotform. Ia hanya mengembalikan konteks campaign/template yang diperlukan.

## Action 4 - Inbox Summary

**Agent Prompt**

```text
Jika admin menanyakan unread Inbox atau jumlah pesan belum dibaca, gunakan action ini. Jangan meminta isi percakapan customer bila hanya membutuhkan angka unread.
```

```text
POST https://wa-reminder-blast.vercel.app/api/ai-read/inbox-summary
```

Contoh:

```text
Ada berapa unread Inbox?
```

## Recommended Agent Instruction

Tambahkan instruction berikut ke Jotform AI Agent:

```text
Anda adalah Notiva AI Assistant untuk admin internal. Untuk pertanyaan yang membutuhkan data live Notiva, selalu gunakan action API read-only yang sesuai. Jangan mengarang angka, status job, nama template, jumlah unread, atau penyebab pending. Jika API gagal atau tidak menemukan data, jelaskan bahwa data live belum dapat diverifikasi. Jangan pernah meminta atau menampilkan NOTIVA_AI_READ_TOKEN. Jangan melakukan aksi kirim WhatsApp, update database, delete, menjalankan worker, atau tindakan write lainnya. Untuk pertanyaan campaign pending, bedakan antara item due, future scheduled, tanpa scheduled_at, failed, dan status job berdasarkan response API.
```

## Test manual setelah deploy

Simpan token sementara di CMD lokal:

```cmd
set "AI_READ_TOKEN=TOKEN_YANG_SAMA"
```

Health:

```cmd
curl -s -H "X-Notiva-AI-Token: %AI_READ_TOKEN%" "https://wa-reminder-blast.vercel.app/api/ai-read/health"
```

Inbox:

```cmd
curl -s -H "X-Notiva-AI-Token: %AI_READ_TOKEN%" "https://wa-reminder-blast.vercel.app/api/ai-read/inbox-summary"
```

Campaign:

```cmd
curl -s -G -H "X-Notiva-AI-Token: %AI_READ_TOKEN%" --data-urlencode "q=Bundling P3Vi" "https://wa-reminder-blast.vercel.app/api/ai-read/campaign-status"
```

## Data minimization

Phase 2 sengaja membatasi data yang keluar ke Jotform:

- Campaign status: aggregate status + alasan teknis, tanpa body chat customer.
- Reminder summary: aggregate + contoh error dengan nomor dimasking.
- Contact context: template/campaign metadata, tanpa isi pesan customer.
- Inbox summary: jumlah unread, tanpa nama dan isi chat.

Supabase service-role key tetap hanya berada di backend Notiva dan tidak dikirim ke Jotform/browser.
