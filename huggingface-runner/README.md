# WA Reminder Blast Auto Worker

Auto Worker adalah service background untuk menjalankan:

- Auto Reminder Scheduler
- Job Queue Processor
- Batch WhatsApp Sender

## Environment Variables

APP_URL=https://your-vercel-app.vercel.app
JOB_RUNNER_SECRET=same_secret_as_next_app
INTERVAL_MS=15000
JOB_BATCH_LIMIT=10
JOB_TYPE=

JOB_TYPE can be empty, reminder, or blast.
