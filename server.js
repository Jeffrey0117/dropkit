const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const config = require('./dropkit.config.js')
const PORT = config.port
const SUBMISSIONS_FILE = path.join(__dirname, 'data', 'submissions.json')

// ── Data helpers ────────────────────────────────────────

function loadSubmissions() {
  try {
    return JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, 'utf-8'))
  } catch {
    return []
  }
}

function saveSubmission(entry) {
  const dir = path.dirname(SUBMISSIONS_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const submissions = loadSubmissions()
  submissions.push(entry)
  fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(submissions, null, 2))
}

// ── Rate limiting ───────────────────────────────────────

const rateLimitMap = new Map()

function checkRateLimit(ip) {
  const now = Date.now()
  const hourAgo = now - 60 * 60 * 1000
  const timestamps = (rateLimitMap.get(ip) || []).filter(t => t > hourAgo)
  rateLimitMap.set(ip, timestamps)
  if (timestamps.length >= 10) return false
  timestamps.push(now)
  return true
}

// ── HTTP utilities ──────────────────────────────────────

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(body)) }
      catch { resolve({}) }
    })
    req.on('error', reject)
  })
}

function parseRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

function serveStatic(res, filePath) {
  const fullPath = path.join(__dirname, 'public', filePath === '/' ? 'index.html' : filePath)
  const ext = path.extname(fullPath)
  const mime = MIME_TYPES[ext] || 'application/octet-stream'

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not Found')
      return
    }
    res.writeHead(200, { 'Content-Type': mime })
    res.end(data)
  })
}

function checkAdmin(req, url) {
  const auth = req.headers['x-admin-password'] || url.searchParams.get('pw') || ''
  return auth === config.adminPassword
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown'
}

// ── Validation ──────────────────────────────────────────

const EMAIL_RE = /.+@.+\..+/
const fieldNames = new Set(config.fields.map(f => f.name))

function validateSubmission(data) {
  const errors = []
  for (const field of config.fields) {
    const value = data[field.name]

    if (field.required && (!value || (typeof value === 'string' && !value.trim()))) {
      errors.push(`${field.label} is required`)
      continue
    }

    if (!value) continue

    if (field.type === 'email' && !EMAIL_RE.test(value)) {
      errors.push(`${field.label} must be a valid email`)
    }

    if (typeof value === 'string' && value.length > 10000) {
      errors.push(`${field.label} exceeds maximum length`)
    }
  }

  // Reject unknown fields
  for (const key of Object.keys(data)) {
    if (!fieldNames.has(key)) {
      errors.push(`Unknown field: ${key}`)
    }
  }

  return errors
}

// ── CSV export ──────────────────────────────────────────

function csvEscape(val) {
  if (val == null) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

function buildCsv(submissions) {
  const headers = ['ID', ...config.fields.map(f => f.label), 'Created At']
  const rows = [headers.map(csvEscape).join(',')]

  for (const sub of submissions) {
    const row = [
      csvEscape(sub.id),
      ...config.fields.map(f => csvEscape(sub.data[f.name])),
      csvEscape(sub.createdAt),
    ]
    rows.push(row.join(','))
  }

  return rows.join('\r\n')
}

// ── Server ──────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const pathname = url.pathname

  // Health
  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, { status: 'ok', service: 'dropkit' })
  }

  // Config (public — no password)
  if (pathname === '/api/config' && req.method === 'GET') {
    return sendJson(res, {
      title: config.title,
      description: config.description,
      fields: config.fields,
      successMessage: config.successMessage,
      maxFileSize: config.maxFileSize,
    })
  }

  // File upload proxy to Pokkit
  if (pathname === '/api/upload' && req.method === 'POST') {
    const contentType = req.headers['content-type'] || ''
    if (!contentType.includes('multipart/form-data')) {
      return sendJson(res, { error: 'Expected multipart/form-data' }, 400)
    }

    const rawBody = await parseRawBody(req)

    // Check file size
    if (config.maxFileSize && rawBody.length > config.maxFileSize) {
      return sendJson(res, { error: `File exceeds ${Math.round(config.maxFileSize / 1024 / 1024)}MB limit` }, 413)
    }

    // Forward to Pokkit
    try {
      const pokkitHeaders = { 'Content-Type': contentType }
      if (config.pokkitAuth) {
        pokkitHeaders['Authorization'] = `Bearer ${config.pokkitAuth}`
      }

      const pokkitRes = await fetch(`${config.pokkitUrl}/upload`, {
        method: 'POST',
        headers: pokkitHeaders,
        body: rawBody,
      })

      const result = await pokkitRes.json()

      if (!pokkitRes.ok) {
        return sendJson(res, { error: result.error || 'Upload failed' }, pokkitRes.status)
      }

      return sendJson(res, {
        url: result.url || result.directUrl,
        filename: result.filename,
      })
    } catch (err) {
      return sendJson(res, { error: 'File upload service unavailable' }, 502)
    }
  }

  // Submit
  if (pathname === '/api/submit' && req.method === 'POST') {
    const ip = getClientIp(req)
    if (!checkRateLimit(ip)) {
      return sendJson(res, { error: 'Too many submissions. Please try again later.' }, 429)
    }

    const body = await parseBody(req)
    const errors = validateSubmission(body)
    if (errors.length > 0) {
      return sendJson(res, { error: errors[0], errors }, 400)
    }

    const submission = {
      id: crypto.randomUUID(),
      data: { ...body },
      ip,
      createdAt: new Date().toISOString(),
    }
    saveSubmission(submission)

    return sendJson(res, { success: true, id: submission.id })
  }

  // ── Admin API ──────────────────────────────────────

  if (pathname === '/api/admin/stats' && req.method === 'GET') {
    if (!checkAdmin(req, url)) return sendJson(res, { error: 'Unauthorized' }, 401)
    const submissions = loadSubmissions()
    const today = new Date().toISOString().slice(0, 10)
    const todayCount = submissions.filter(s => s.createdAt && s.createdAt.startsWith(today)).length
    return sendJson(res, {
      total: submissions.length,
      today: todayCount,
    })
  }

  if (pathname === '/api/admin/submissions' && req.method === 'GET') {
    if (!checkAdmin(req, url)) return sendJson(res, { error: 'Unauthorized' }, 401)
    const submissions = loadSubmissions()
    const sorted = [...submissions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    return sendJson(res, { submissions: sorted, fields: config.fields })
  }

  if (pathname === '/api/admin/export' && req.method === 'GET') {
    if (!checkAdmin(req, url)) return sendJson(res, { error: 'Unauthorized' }, 401)
    const submissions = loadSubmissions()
    const sorted = [...submissions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    const csv = buildCsv(sorted)
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="submissions.csv"',
    })
    return res.end('\uFEFF' + csv) // BOM for Excel UTF-8
  }

  // Send email to one or more submissions
  if (pathname === '/api/admin/send-email' && req.method === 'POST') {
    if (!checkAdmin(req, url)) return sendJson(res, { error: 'Unauthorized' }, 401)

    const body = await parseBody(req)
    const { ids, emails: customEmails, subject, html } = body

    if (!subject || !html) {
      return sendJson(res, { error: 'Missing subject or html' }, 400)
    }

    let emails = []

    if (customEmails && customEmails.length > 0) {
      // Custom mode: directly provided email list
      emails = customEmails.filter(e => typeof e === 'string' && e.includes('@'))
    } else {
      // Submission mode: resolve from IDs or send to all
      const submissions = loadSubmissions()
      const emailField = config.fields.find(f => f.type === 'email')
      if (!emailField) {
        return sendJson(res, { error: 'No email field defined in config' }, 400)
      }

      const targets = (ids && ids.length > 0)
        ? submissions.filter(s => ids.includes(s.id))
        : submissions

      emails = targets
        .map(s => s.data[emailField.name])
        .filter(e => e && e.includes('@'))
    }

    // Deduplicate
    emails = [...new Set(emails)]

    if (emails.length === 0) {
      return sendJson(res, { error: 'No valid email addresses found' }, 400)
    }

    // Send via Mailer
    const mailerHeaders = { 'Content-Type': 'application/json' }
    if (config.mailerToken) {
      mailerHeaders['Authorization'] = `Bearer ${config.mailerToken}`
    }

    const results = { sent: 0, failed: 0, errors: [] }

    for (const to of emails) {
      try {
        const mailerRes = await fetch(`${config.mailerUrl}/api/send`, {
          method: 'POST',
          headers: mailerHeaders,
          body: JSON.stringify({ to, subject, html, from: config.mailerFrom || 'DropKit <noreply@isnowfriend.com>' }),
        })
        if (mailerRes.ok) {
          results.sent++
        } else {
          const err = await mailerRes.json().catch(() => ({}))
          results.failed++
          results.errors.push({ to, error: err.error || 'Send failed' })
        }
      } catch {
        results.failed++
        results.errors.push({ to, error: 'Mailer unavailable' })
      }
    }

    return sendJson(res, { success: true, ...results })
  }

  // Static files
  serveStatic(res, pathname)
})

server.listen(PORT, () => {
  console.log(`DropKit running on port ${PORT}`)
  console.log(`  Form: http://localhost:${PORT}/`)
  console.log(`  Admin: http://localhost:${PORT}/admin.html`)
})
