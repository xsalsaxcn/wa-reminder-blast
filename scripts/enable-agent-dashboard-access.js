const fs = require('fs')
const path = require('path')

const root = process.cwd()

const scanRoots = [
  'pages',
  'pages/api',
  'components'
]

const protectedKeywords = [
  'manage-users',
  'reset-db',
  'database-manager',
  'meta-test',
  'whatsapp-settings',
  'auto-worker',
  'blacklist',
  'quick-replies',
  'analysis',
  'usage',
  'setup-master'
]

const dashboardKeywords = [
  'dashboard',
  'ringkasan operasional',
  'total databases',
  'total contacts',
  'total sent',
  'total failed',
  'reminder performance',
  'whatsapp blast performance',
  'pending jobs',
  'processing jobs',
  'done jobs'
]

function walk(targetPath) {
  const absolute = path.join(root, targetPath)

  if (!fs.existsSync(absolute)) {
    return []
  }

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

function shouldSkip(relativePath) {
  const lower = relativePath.replaceAll('\\', '/').toLowerCase()

  return protectedKeywords.some((keyword) => lower.includes(keyword))
}

function isDashboardRelated(relativePath, content) {
  const text = `${relativePath}\n${content}`.toLowerCase()

  return dashboardKeywords.some((keyword) => text.includes(keyword))
}

function patchContent(content) {
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

const files = Array.from(new Set(scanRoots.flatMap(walk)))

let updated = 0
let matched = 0
let skipped = 0

for (const file of files) {
  const relativePath = path.relative(root, file)
  const before = fs.readFileSync(file, 'utf8')

  if (shouldSkip(relativePath)) {
    skipped += 1
    continue
  }

  if (!isDashboardRelated(relativePath, before)) {
    continue
  }

  matched += 1

  const after = patchContent(before)

  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8')
    updated += 1
    console.log('[UPDATED]', relativePath)
  } else {
    console.log('[NO CHANGE]', relativePath)
  }
}

console.log('')
console.log('Done.')
console.log('Dashboard related files matched:', matched)
console.log('Updated files:', updated)
console.log('Skipped files:', skipped)