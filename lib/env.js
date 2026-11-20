// 零依賴 .env 讀取。PM2 不會幫忙注入 .env, 沒有這個的話 server 從來讀不到 ADMIN_PASSWORD,
// 會一路用程式碼裡的預設值 (2026-11-20 前線上就是這樣)。
// 已經在 process.env 的值優先 (PM2 / 系統設定的不會被檔案蓋掉)。
const fs = require('fs')
const path = require('path')

function parseEnv(text) {
  const out = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '')
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

function loadEnv(file = process.env.DROPKIT_ENV_FILE || path.join(__dirname, '..', '.env')) {
  if (process.env.DROPKIT_SKIP_DOTENV === '1') return
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return
  }
  for (const [key, value] of Object.entries(parseEnv(text))) {
    if (process.env[key] === undefined) process.env[key] = value
  }
}

module.exports = { loadEnv, parseEnv }
