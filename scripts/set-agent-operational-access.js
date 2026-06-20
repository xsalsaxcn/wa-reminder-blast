const fs = require('fs')
const path = require('path')

const root = process.cwd()

const allowAgentTargets = [
  'pages/dashboard',
  'pages/api/dashboard',
  'pages/api/stats',

  'pages/inbox',
  'pages/api/inbox',

  'pages/quick-replies.js',
  'pages/api/quick-replies',

  'pages/analysis.js',
  'pages/api/analysis',
  'pages/api/admin/analyze-inbox.js',

  'pages/usage.js',
  'pages/api/usage',

  'pages/blacklist.js',
  'pages/api/blacklist',

  'pages/reminder.js',
  'pages/api/reminder',

  'pages/blast.js',
  'pages/api/blast',

  'pages/admin/import-reminder.js',
  'pages/admin/import-blast.js',

  'pages/api/admin/import-reminder',
  'pages/api/admin/import-blast',
  'pages/api/import-reminder',
  'pages/api/import-blast',

  'pages/jobs.js',
  'pages/api/jobs',

  'pages/job-performance.js',
  'pages/api/job-performance',

  'pages/logs.js',
  'pages/api/logs'
]

const adminOnlyTargets = [
  'pages/admin/database-manager.js',
  'pages/admin/database-manager',
  'pages/api/admin/database-manager',

  'pages/admin/auto-worker.js',
  'pages/api/admin/auto-worker',

  'pages/admin/meta-test.js',
  'pages/api/admin/meta-test',

  'pages/admin/whatsapp-settings.js',
  'pages/api/admin/whatsapp-settings',

  'pages/admin/manage-users.js',
  'pages/api/admin/users'
]

const masterOnlyTargets = [
  'pages/admin/reset-db.js',
  'pages/api/admin/reset-db'
]

function walk(targetPath) {
  const absolute = path.join(root, targetPath)

  if (!fs.existsSync(absolute)) return []

  const stat = fs.statSync(absolute)

  if (stat.isFile()) {
    return absolute.endsWith('.js') ? [absolute] : []
  }

  const files = []

  for (const item of fs.readdirSync(absolute)) {
    const current = path.join(absolute, item)
    const currentStat = fs.statSync(current)

    if (currentStat.isDirectory()) {
      files.push(...walk(path.relative(root, current)))
    } else if (current.endsWith('.js')) {
      files.push(current)
    }
  }

  return files
}

function addAgentToOperational(content) {
  let next = content

  next = next.replace(
    /\[\s*['"]master['"]\s*,\s*['"]admin['"]\s*,\s*['"]user['"]\s*\]/g,
    "['master', 'admin', 'user', 'agent']"
  )

  next = next.replace(
    /\[\s*['"]master['"]\s*,\s*['"]admin['"]\s*\]/g,
    "['master', 'admin', 'agent']"
  )

  next = next.replace(
    /\[\s*['"]master['"]\s*,\s*['"]admin['"]\s*,\s*['"]user['"]\s*,\s*['"]agent['"]\s*,\s*['"]agent['"]\s*\]/g,
    "['master', 'admin', 'user', 'agent']"
  )

  next = next.replace(
    /\[\s*['"]master['"]\s*,\s*['"]admin['"]\s*,\s*['"]agent['"]\s*,\s*['"]agent['"]\s*\]/g,
    "['master', 'admin', 'agent']"
  )

  return next
}

function setAdminOnly(content) {
  let next = content

  next = next.replace(
    /\[\s*['"]master['"]\s*,\s*['"]admin['"]\s*,\s*['"]user['"]\s*,\s*['"]agent['"]\s*\]/g,
    "['master', 'admin']"
  )

  next = next.replace(
    /\[\s*['"]master['"]\s*,\s*['"]admin['"]\s*,\s*['"]agent['"]\s*\]/g,
    "['master', 'admin']"
  )

  next = next.replace(
    /\[\s*['"]master['"]\s*,\s*['"]admin['"]\s*,\s*['"]user['"]\s*\]/g,
    "['master', 'admin']"
  )

  return next
}

function setMasterOnly(content) {
  let next = content

  next = next.replace(
    /\[\s*['"]master['"]\s*,\s*['"]admin['"]\s*,\s*['"]user['"]\s*,\s*['"]agent['"]\s*\]/g,
    "['master']"
  )

  next = next.replace(
    /\[\s*['"]master['"]\s*,\s*['"]admin['"]\s*,\s*['"]agent['"]\s*\]/g,
    "['master']"
  )

  next = next.replace(
    /\[\s*['"]master['"]\s*,\s*['"]admin['"]\s*,\s*['"]user['"]\s*\]/g,
    "['master']"
  )

  next = next.replace(
    /\[\s*['"]master['"]\s*,\s*['"]admin['"]\s*\]/g,
    "['master']"
  )

  return next
}

function updateFiles(targets, patcher, label) {
  const files = Array.from(new Set(targets.flatMap(walk)))
  let updated = 0
  let scanned = 0

  for (const file of files) {
    scanned += 1

    const before = fs.readFileSync(file, 'utf8')
    const after = patcher(before)

    if (after !== before) {
      fs.writeFileSync(file, after, 'utf8')
      updated += 1
      console.log(`[${label}]`, path.relative(root, file))
    }
  }

  return { scanned, updated }
}

const allow = updateFiles(allowAgentTargets, addAgentToOperational, 'ALLOW AGENT')
const admin = updateFiles(adminOnlyTargets, setAdminOnly, 'ADMIN ONLY')
const master = updateFiles(masterOnlyTargets, setMasterOnly, 'MASTER ONLY')

console.log('')
console.log('Done.')
console.log('Allow agent scanned:', allow.scanned, 'updated:', allow.updated)
console.log('Admin only scanned:', admin.scanned, 'updated:', admin.updated)
console.log('Master only scanned:', master.scanned, 'updated:', master.updated)