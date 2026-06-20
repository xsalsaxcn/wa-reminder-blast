const fs = require('fs')
const path = require('path')

const root = process.cwd()

const targets = [
  'pages/api/jobs',
  'pages/api/job-performance',
  'pages/api/logs',
  'pages/api/blast',
  'pages/api/reminder',

  'pages/jobs.js',
  'pages/job-performance.js',
  'pages/logs.js',
  'pages/blast.js',
  'pages/reminder.js'
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

function shouldSkip(filePath) {
  const normalized = filePath.replaceAll('\\', '/').toLowerCase()
  return protectedKeywords.some((keyword) => normalized.includes(keyword))
}

function patchContent(content) {
  let next = content

  const replacements = [
    {
      from: /\['master', 'admin', 'user'\]/g,
      to: "['master', 'admin', 'user', 'agent']"
    },
    {
      from: /\["master", "admin", "user"\]/g,
      to: '["master", "admin", "user", "agent"]'
    },
    {
      from: /\['master','admin','user'\]/g,
      to: "['master','admin','user','agent']"
    },
    {
      from: /\["master","admin","user"\]/g,
      to: '["master","admin","user","agent"]'
    },
    {
      from: /roles:\s*\['master', 'admin', 'user'\]/g,
      to: "roles: ['master', 'admin', 'user', 'agent']"
    },
    {
      from: /roles:\s*\["master", "admin", "user"\]/g,
      to: 'roles: ["master", "admin", "user", "agent"]'
    }
  ]

  for (const replacement of replacements) {
    next = next.replace(replacement.from, replacement.to)
  }

  return next
}

const files = Array.from(new Set(targets.flatMap(walk)))

let changed = 0
let skipped = 0

for (const file of files) {
  if (shouldSkip(file)) {
    skipped += 1
    console.log('[SKIP]', path.relative(root, file))
    continue
  }

  const before = fs.readFileSync(file, 'utf8')
  const after = patchContent(before)

  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8')
    changed += 1
    console.log('[UPDATED]', path.relative(root, file))
  } else {
    console.log('[NO CHANGE]', path.relative(root, file))
  }
}

console.log('')
console.log('Done.')
console.log('Updated files:', changed)
console.log('Skipped files:', skipped)