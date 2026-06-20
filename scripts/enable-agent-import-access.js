const fs = require('fs')
const path = require('path')

const root = process.cwd()

const scanRoots = [
  'pages/admin',
  'pages/api'
]

const skipKeywords = [
  'database-manager',
  'reset-db',
  'manage-users',
  'meta-test',
  'whatsapp-settings',
  'auto-worker',
  'blacklist',
  'quick-replies',
  'analysis',
  'usage',
  'setup-master'
]

function walk(dir) {
  const absolute = path.join(root, dir)

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

function isSkipped(relativePath) {
  const lower = relativePath.replaceAll('\\', '/').toLowerCase()
  return skipKeywords.some((keyword) => lower.includes(keyword))
}

function isImportRelated(relativePath, content) {
  const text = `${relativePath}\n${content}`.toLowerCase()

  if (text.includes('import-reminder')) return true
  if (text.includes('import-blast')) return true
  if (text.includes('import reminder')) return true
  if (text.includes('import blast')) return true

  if (
    text.includes('contact_databases') &&
    (
      text.includes('csv') ||
      text.includes('xlsx') ||
      text.includes('excel') ||
      text.includes('upload') ||
      text.includes('file')
    )
  ) {
    return true
  }

  return false
}

function patchRoleArrays(content) {
  let next = content

  next = next.replace(
    /\[\s*['"]master['"]\s*,\s*['"]admin['"]\s*\]/g,
    "['master', 'admin', 'agent']"
  )

  next = next.replace(
    /\[\s*['"]master['"]\s*,\s*['"]admin['"]\s*,\s*['"]user['"]\s*\]/g,
    "['master', 'admin', 'user', 'agent']"
  )

  next = next.replace(
    /\[\s*['"]master['"]\s*,\s*['"]admin['"]\s*,\s*['"]agent['"]\s*,\s*['"]agent['"]\s*\]/g,
    "['master', 'admin', 'agent']"
  )

  next = next.replace(
    /\[\s*['"]master['"]\s*,\s*['"]admin['"]\s*,\s*['"]user['"]\s*,\s*['"]agent['"]\s*,\s*['"]agent['"]\s*\]/g,
    "['master', 'admin', 'user', 'agent']"
  )

  return next
}

const files = scanRoots.flatMap(walk)

let updated = 0
let skipped = 0
let noChange = 0

for (const file of files) {
  const relativePath = path.relative(root, file)
  const before = fs.readFileSync(file, 'utf8')

  if (isSkipped(relativePath)) {
    skipped += 1
    continue
  }

  if (!isImportRelated(relativePath, before)) {
    continue
  }

  const after = patchRoleArrays(before)

  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8')
    updated += 1
    console.log('[UPDATED]', relativePath)
  } else {
    noChange += 1
    console.log('[NO CHANGE]', relativePath)
  }
}

console.log('')
console.log('Done.')
console.log('Updated:', updated)
console.log('No change:', noChange)
console.log('Skipped:', skipped)