function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getSendDelayMs() {
  const raw = process.env.WHATSAPP_SEND_DELAY_MS || '2000'
  const parsed = Number(raw)

  if (Number.isNaN(parsed)) return 2000

  // Minimal 500ms, maksimal 10000ms supaya tidak berlebihan
  return Math.min(Math.max(parsed, 500), 10000)
}

export {
  sleep,
  getSendDelayMs
}
