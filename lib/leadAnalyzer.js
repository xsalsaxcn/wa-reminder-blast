function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\sáéíóúàèìòùäëïöüçñ.,!?/-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword))
}

function collectMatches(text, keywords) {
  return keywords.filter((keyword) => text.includes(keyword))
}

const keywordGroups = {
  optOut: [
    'stop',
    'unsubscribe',
    'jangan kirim',
    'jangan wa',
    'jangan chat',
    'hapus nomor',
    'hapus data',
    'salah nomor',
    'blokir',
    'block',
    'tidak mau dihubungi',
    'ga usah hubungi',
    'nggak usah hubungi'
  ],

  interested: [
    'mau',
    'minat',
    'tertarik',
    'daftar',
    'ikut',
    'lanjut',
    'boleh',
    'bisa',
    'iya',
    'ya',
    'ok',
    'oke',
    'deal',
    'booking',
    'jadwalkan',
    'info',
    'detail',
    'kirim info',
    'hubungi',
    'wa saya',
    'saya mau',
    'aku mau',
    'kami mau'
  ],

  price: [
    'harga',
    'biaya',
    'tarif',
    'berapa',
    'brp',
    'paket',
    'pricelist',
    'price list',
    'quote',
    'penawaran',
    'diskon',
    'nego'
  ],

  schedule: [
    'jadwal',
    'kapan',
    'tanggal',
    'hari apa',
    'besok',
    'minggu depan',
    'bulan depan',
    'jam berapa',
    'available',
    'slot'
  ],

  location: [
    'lokasi',
    'alamat',
    'dimana',
    'di mana',
    'maps',
    'map',
    'cabang',
    'klinik mana'
  ],

  callback: [
    'hubungi saya',
    'telepon',
    'telpon',
    'call',
    'admin hubungi',
    'minta dihubungi',
    'bisa hubungi',
    'kontak saya'
  ],

  followUp: [
    'nanti',
    'tanya dulu',
    'pikir dulu',
    'kabari',
    'kabarin',
    'follow up',
    'followup',
    'besok ya',
    'minggu depan ya'
  ],

  notInterested: [
    'tidak minat',
    'ga minat',
    'gak minat',
    'nggak minat',
    'tidak tertarik',
    'ga tertarik',
    'gak tertarik',
    'belum minat',
    'ga dulu',
    'gak dulu',
    'nggak dulu',
    'tidak dulu',
    'belum dulu',
    'mahal',
    'kemahalan',
    'sudah punya',
    'sudah ada',
    'tidak perlu',
    'ga perlu',
    'gak perlu'
  ],

  complaint: [
    'komplain',
    'kecewa',
    'buruk',
    'lama',
    'tidak puas',
    'ga puas',
    'gak puas',
    'marah',
    'refund',
    'cancel',
    'batal'
  ]
}

export function analyzeLeadMessage(message) {
  const text = normalizeText(message)

  if (!text) {
    return {
      label: 'Netral',
      intent: 'Kosong',
      score: 40,
      confidence: 40,
      status: 'neutral',
      reasons: ['Pesan kosong']
    }
  }

  const reasons = []

  const optOutMatches = collectMatches(text, keywordGroups.optOut)
  const interestedMatches = collectMatches(text, keywordGroups.interested)
  const priceMatches = collectMatches(text, keywordGroups.price)
  const scheduleMatches = collectMatches(text, keywordGroups.schedule)
  const locationMatches = collectMatches(text, keywordGroups.location)
  const callbackMatches = collectMatches(text, keywordGroups.callback)
  const followUpMatches = collectMatches(text, keywordGroups.followUp)
  const notInterestedMatches = collectMatches(text, keywordGroups.notInterested)
  const complaintMatches = collectMatches(text, keywordGroups.complaint)

  if (optOutMatches.length > 0) {
    return {
      label: 'Opt-out',
      intent: 'Stop / Jangan dikirimi',
      score: 0,
      confidence: 95,
      status: 'opt_out',
      reasons: optOutMatches.map((item) => `Keyword opt-out: ${item}`)
    }
  }

  if (complaintMatches.length > 0) {
    return {
      label: 'Komplain',
      intent: 'Komplain / perlu follow-up admin',
      score: 20,
      confidence: 85,
      status: 'complaint',
      reasons: complaintMatches.map((item) => `Keyword komplain: ${item}`)
    }
  }

  if (notInterestedMatches.length > 0) {
    return {
      label: 'Tidak berminat',
      intent: 'Tidak berminat',
      score: 15,
      confidence: 85,
      status: 'not_interested',
      reasons: notInterestedMatches.map((item) => `Keyword tidak berminat: ${item}`)
    }
  }

  let score = 45
  let confidence = 55
  let label = 'Netral'
  let intent = 'Umum'
  let status = 'neutral'

  if (interestedMatches.length > 0) {
    score += 25
    confidence += 15
    label = 'Berminat'
    intent = 'Tertarik / respons positif'
    status = 'interested'
    reasons.push(...interestedMatches.map((item) => `Keyword berminat: ${item}`))
  }

  if (priceMatches.length > 0) {
    score += 20
    confidence += 15
    label = 'Berminat'
    intent = 'Minta harga'
    status = 'interested'
    reasons.push(...priceMatches.map((item) => `Keyword harga: ${item}`))
  }

  if (scheduleMatches.length > 0) {
    score += 18
    confidence += 12
    label = 'Berminat'
    intent = 'Minta jadwal'
    status = 'interested'
    reasons.push(...scheduleMatches.map((item) => `Keyword jadwal: ${item}`))
  }

  if (locationMatches.length > 0) {
    score += 12
    confidence += 10
    label = 'Berminat'
    intent = 'Minta lokasi'
    status = 'interested'
    reasons.push(...locationMatches.map((item) => `Keyword lokasi: ${item}`))
  }

  if (callbackMatches.length > 0) {
    score += 20
    confidence += 12
    label = 'Berminat'
    intent = 'Minta dihubungi admin'
    status = 'interested'
    reasons.push(...callbackMatches.map((item) => `Keyword callback: ${item}`))
  }

  if (followUpMatches.length > 0 && status !== 'interested') {
    score += 8
    confidence += 8
    label = 'Follow-up'
    intent = 'Perlu follow-up'
    status = 'follow_up'
    reasons.push(...followUpMatches.map((item) => `Keyword follow-up: ${item}`))
  }

  if (reasons.length === 0) {
    reasons.push('Tidak ada keyword kuat')
  }

  score = Math.max(0, Math.min(100, score))
  confidence = Math.max(0, Math.min(100, confidence))

  if (score >= 80) {
    label = 'Berminat'
    status = 'interested'
  } else if (score >= 55 && status === 'neutral') {
    label = 'Follow-up'
    status = 'follow_up'
  }

  return {
    label,
    intent,
    score,
    confidence,
    status,
    reasons
  }
}