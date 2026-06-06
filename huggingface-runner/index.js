const APP_URL = process.env.APP_URL
const JOB_worker_SECRET = process.env.JOB_worker_SECRET
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 15000)
const JOB_TYPE = process.env.JOB_TYPE || ''
const JOB_BATCH_LIMIT = process.env.JOB_BATCH_LIMIT || '10'

if (!APP_URL) {
  console.error('APP_URL is required')
  process.exit(1)
}

if (!JOB_worker_SECRET) {
  console.error('JOB_worker_SECRET is required')
  process.exit(1)
}

let running = false

async function tick() {
  if (running) {
    console.log('Previous tick still running, skip.')
    return
  }

  running = true

  try {
    const url = new URL('/api/jobs/process-next', APP_URL)

    if (JOB_TYPE) url.searchParams.set('type', JOB_TYPE)
    url.searchParams.set('limit', JOB_BATCH_LIMIT)

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'x-job-worker-secret': JOB_worker_SECRET,
        'Content-Type': 'application/json'
      }
    })

    const data = await response.json()

    console.log(new Date().toISOString(), JSON.stringify(data))
  } catch (error) {
    console.error(new Date().toISOString(), error.message)
  } finally {
    running = false
  }
}

console.log('WA Reminder Blast Auto Worker started')
console.log('APP_URL:', APP_URL)
console.log('INTERVAL_MS:', INTERVAL_MS)
console.log('JOB_TYPE:', JOB_TYPE || 'all')
console.log('JOB_BATCH_LIMIT:', JOB_BATCH_LIMIT)

tick()
setInterval(tick, INTERVAL_MS)

