// 2026-11-20 安全修補的回歸測試。跑法: node --test tests/
//
// 修之前的三個洞:
//   1. 後台密碼: server 從來沒讀 .env, 線上一直用程式碼裡寫死的 'dropkit2024' (公開 repo 看得到)
//      → 任何人都能看報名者個資、匯出 CSV、拿 send-email 當垃圾信中繼站。
//   2. /api/upload 先把整個 body 收進記憶體才看大小 → 送幾 GB 就能把服務吃到 OOM。
//   3. /api/upload 沒有限流、沒有檔案類型限制, 等於免費的公開檔案空間 (存在 Pokkit)。
const { test, before, after } = require('node:test')
const assert = require('node:assert')
const http = require('node:http')
const path = require('node:path')

const PASSWORD = 'test-admin-password-123'
let pokkit, pokkitHits = 0, base, server

before(async () => {
  pokkit = http.createServer((req, res) => {
    pokkitHits++
    req.resume()
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ url: 'https://files.example/x.pdf', filename: 'x.pdf' }))
    })
  })
  await new Promise(r => pokkit.listen(0, '127.0.0.1', r))
  process.env.POKKIT_URL = `http://127.0.0.1:${pokkit.address().port}`
  process.env.ADMIN_PASSWORD = PASSWORD
  process.env.DROPKIT_UPLOAD_LIMIT_PER_HOUR = '3'
  process.env.DROPKIT_SKIP_DOTENV = '1'
  const mod = require(path.join(__dirname, '..', 'server.js'))
  server = mod.server || mod
  if (!server.listening) await new Promise(r => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
})

after(() => { server.close(); pokkit.close() })

function multipart(filename, content, ip = '198.51.100.1') {
  const boundary = '----dk' + Math.random().toString(16).slice(2)
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    Buffer.isBuffer(content) ? content : Buffer.from(content),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  return fetch(base + '/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'cf-connecting-ip': ip },
    body,
  })
}

// 在乾淨的子行程裡載入 server: 看它「自己」怎麼決定後台密碼 (不靠測試塞的 env)
function adminCheckInChild(envFileContent, tried) {
  const fs = require('node:fs')
  const os = require('node:os')
  const { execFileSync } = require('node:child_process')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-env-'))
  const envFile = path.join(dir, '.env')
  if (envFileContent !== null) fs.writeFileSync(envFile, envFileContent)
  const env = { ...process.env, DROPKIT_ENV_FILE: envFile }
  delete env.ADMIN_PASSWORD
  delete env.DROPKIT_SKIP_DOTENV
  const script = `
    const { server } = require(${JSON.stringify(path.join(__dirname, '..', 'server.js'))})
    server.listen(0, '127.0.0.1', async () => {
      const r = await fetch('http://127.0.0.1:' + server.address().port + '/api/admin/stats',
        { headers: { 'x-admin-password': ${JSON.stringify(tried)} } })
      process.stdout.write(String(r.status)); process.exit(0)
    })`
  return execFileSync(process.execPath, ['-e', script], { env, cwd: dir, timeout: 15000 }).toString()
}

test('without ADMIN_PASSWORD the old hardcoded default is refused', { timeout: 20000 }, () => {
  assert.notStrictEqual(adminCheckInChild(null, 'dropkit2024'), '200')
})

test('ADMIN_PASSWORD is read from the .env file', { timeout: 20000 }, () => {
  assert.strictEqual(adminCheckInChild('ADMIN_PASSWORD=from-dotenv-file-42\n', 'from-dotenv-file-42'), '200')
})

test('the configured admin password works', { timeout: 20000 }, async () => {
  const res = await fetch(base + '/api/admin/stats', { headers: { 'x-admin-password': PASSWORD } })
  assert.strictEqual(res.status, 200)
})

test('upload rejects file types the form does not accept', { timeout: 20000 }, async () => {
  const before = pokkitHits
  const res = await multipart('evil.html', '<script>alert(1)</script>', '198.51.100.20')
  assert.strictEqual(res.status, 415)
  assert.strictEqual(pokkitHits, before, 'must not reach Pokkit')
})

test('upload accepts an allowed type', { timeout: 20000 }, async () => {
  const res = await multipart('cv.pdf', '%PDF-1.4 hello', '198.51.100.21')
  assert.strictEqual(res.status, 200)
})

test('oversized upload is refused by Content-Length before reading the body', { timeout: 20000 }, async () => {
  const res = await new Promise((resolve, reject) => {
    const req = http.request(base + '/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=x',
        'Content-Length': String(500 * 1024 * 1024),
        'cf-connecting-ip': '198.51.100.30',
      },
    }, resolve)
    req.on('error', reject)
    req.write('--x\r\n')  // 只送一點點, 伺服器不該等剩下的 500MB
  })
  assert.strictEqual(res.statusCode, 413)
  res.resume()
})

test('oversized chunked upload is cut off while streaming', { timeout: 20000 }, async () => {
  // 沒有 Content-Length (chunked): 伺服器只能邊收邊算
  const before = pokkitHits
  let sent = 0
  const { code: outcome, sent: sentAtAnswer } = await new Promise((resolve) => {
    const req = http.request(base + '/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=x', 'cf-connecting-ip': '198.51.100.31' },
    }, (res) => { res.resume(); resolve({ code: res.statusCode, sent }) })
    req.on('error', (e) => resolve({ code: e.code, sent }))
    req.write('--x\r\nContent-Disposition: form-data; name="file"; filename="big.pdf"\r\n\r\n')
    const piece = Buffer.alloc(256 * 1024, 0x61)
    const pump = () => {
      while (sent < 40 * 1024 * 1024) {   // 想送 40MB, 上限是 10MB
        sent += piece.length
        if (!req.write(piece)) return req.once('drain', pump)
      }
      req.end('\r\n--x--\r\n')
    }
    pump()
  })
  assert.ok(outcome === 413 || outcome === 'ECONNRESET' || outcome === 'EPIPE', `got ${outcome}`)
  assert.strictEqual(pokkitHits, before, 'must not reach Pokkit')
  // 舊程式會把 40MB 全收完才回 413; 新的要在送完之前就喊停
  assert.ok(sentAtAnswer < 40 * 1024 * 1024, `server read everything (${sentAtAnswer} bytes) before answering`)
})

test('upload is rate limited per visitor', { timeout: 20000 }, async () => {
  const ip = '198.51.100.40'
  const codes = []
  for (let i = 0; i < 5; i++) codes.push((await multipart('cv.pdf', '%PDF', ip)).status)
  assert.deepStrictEqual(codes.slice(0, 3), [200, 200, 200])
  assert.strictEqual(codes[4], 429)
})
