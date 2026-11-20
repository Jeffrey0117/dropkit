// /api/upload 的防線: 邊收邊算大小 (超過就斷)、限流、檔案類型白名單。
// 2026-11-20 以前: 整包收進記憶體才比大小 (送幾 GB 就 OOM)、沒限流、什麼檔都收 → 免費公開檔案空間。
const path = require('path')

// multipart 的邊界與標頭會比檔案本身多一點, 給一點餘裕
const MULTIPART_OVERHEAD = 64 * 1024

class BodyTooLargeError extends Error {}

/** 收 body, 累計超過 limit 立刻停止並丟 BodyTooLargeError (不會把剩下的讀進來) */
function readLimitedBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let done = false
    const fail = (err) => { if (!done) { done = true; reject(err) } }
    req.on('data', (chunk) => {
      if (done) return
      size += chunk.length
      if (size > limit) {
        req.pause()
        fail(new BodyTooLargeError())
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks)) } })
    req.on('error', fail)
  })
}

/** 表單裡所有檔案欄位的 accept 合起來 (例: '.pdf,.doc,.docx') → Set('.pdf', ...)。沒設 accept 回 null。 */
function allowedExtensions(fields) {
  const exts = new Set()
  for (const f of fields || []) {
    if (f.type !== 'file' || !f.accept) continue
    for (const part of String(f.accept).split(',')) {
      const ext = part.trim().toLowerCase()
      if (ext.startsWith('.')) exts.add(ext)
    }
  }
  return exts.size > 0 ? exts : null
}

/** 從 multipart body 抓出所有 filename="..." (只看標頭, 不解整包) */
function multipartFilenames(body) {
  const head = body.toString('latin1')
  const names = []
  const re = /Content-Disposition:[^\r\n]*?filename\*?=(?:UTF-8'')?"?([^"\r\n;]*)"?/gi
  let m
  while ((m = re.exec(head)) !== null) names.push(m[1])
  return names
}

/** 每個檔名的副檔名都要在白名單裡; 一個檔都沒有也不行 */
function filesAllowed(body, allowed) {
  if (!allowed) return true
  const names = multipartFilenames(body)
  if (names.length === 0) return false
  return names.every((n) => allowed.has(path.extname(n).toLowerCase()))
}

/** 滑動視窗限流: 每個 key 在 windowMs 內最多 max 次 */
function createLimiter({ max, windowMs }) {
  const hits = new Map()
  const recentOf = (key, now) => (hits.get(key) || []).filter((t) => t > now - windowMs)
  function allow(key, now = Date.now()) {
    const recent = recentOf(key, now)
    if (recent.length >= max) {
      hits.set(key, recent)
      return false
    }
    hits.set(key, [...recent, now])
    if (hits.size > 10000) hits.clear()
    return true
  }
  /** 只看不記: 這個 key 現在是不是已經用完額度 */
  allow.isBlocked = (key, now = Date.now()) => recentOf(key, now).length >= max
  return allow
}

module.exports = {
  MULTIPART_OVERHEAD,
  BodyTooLargeError,
  readLimitedBody,
  allowedExtensions,
  multipartFilenames,
  filesAllowed,
  createLimiter,
}
