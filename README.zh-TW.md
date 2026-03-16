# DropKit

**設定驅動的表單收件匣** — 一個 config 檔，幾分鐘內上線。

招募收履歷、作業收件、活動報名、客戶需求單 — 改一下設定檔就搞定。

<p align="center">
  <a href="./README.md">English</a> | <strong>繁體中文</strong>
</p>

---

## 想像一下

你要幫公司開一個招募頁。設計師、工程師、PM 都要能投，附上履歷檔案。

打開 `dropkit.config.js`，定義欄位。啟動。表單自動生成，後台自動有，CSV 匯出、群發 Email 全都有。

零依賴。純 Node.js。沒有框架。

---

## 功能

- **零設定表單** — 在 `dropkit.config.js` 定義欄位，UI 自動生成
- **檔案上傳** — 透過 Pokkit 服務處理附件
- **Admin 後台** — 檢視投件、匯出 CSV、發信（單封或群發）
- **Email 整合** — 串接 Mailer 服務，追蹤申請者
- **頻率限制** — 每 IP 每小時 10 次投件
- **暗色主題** — 統一的 canweback 風格
- **純 Node.js** — 零 npm 依賴，無框架負擔

---

## 快速開始

```bash
npm install
pm2 start ecosystem.config.js
```

表單頁：`http://localhost:4021`
管理後台：`http://localhost:4021/admin.html`

---

## 設定

編輯 `dropkit.config.js`：

```javascript
module.exports = {
  title: 'Join Our Team',
  description: 'Fill out the form below to apply',
  adminPassword: 'your-secure-password',
  port: 4021,

  fields: [
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'role', label: 'Position', type: 'select',
      options: ['Developer', 'Designer', 'PM'], required: true },
    { name: 'intro', label: 'About You', type: 'textarea' },
    { name: 'resume', label: 'Resume', type: 'file',
      accept: '.pdf,.doc,.docx' },
  ],

  successMessage: 'Thanks! We received your application.',
  maxFileSize: 10 * 1024 * 1024, // 10MB
}
```

### 欄位類型

- `text` — 單行輸入
- `email` — Email 驗證
- `textarea` — 多行輸入
- `select` — 下拉選單（需要 `options` 陣列）
- `file` — 檔案上傳（需要 Pokkit 服務）

---

## Admin 後台

進入 `/admin.html`，用設定檔中的密碼登入。

功能：
- 檢視所有投件（含時間戳記）
- 匯出 CSV（Excel 相容 UTF-8 BOM）
- 選取投件後發信
- 群發給所有投件者
- 自訂收件人清單發信

---

## 架構

```
┌─────────────┐
│   瀏覽器    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  DropKit    │ ← 設定驅動的表單 + 後台
│  (4021)     │
└──────┬──────┘
       │
       ├─────▶ Pokkit (4009)   [檔案上傳]
       └─────▶ Mailer (4018)   [Email 發送]
```

---

## 部署

### CloudPipe（推薦）

1. Push 到 GitHub
2. 在 CloudPipe 註冊專案
3. Gateway 自動透過子網域代理

### 獨立部署

```bash
export ADMIN_PASSWORD=your-password
export POKKIT_URL=http://localhost:4009
export POKKIT_AUTH=Bearer your-key
export MAILER_URL=http://localhost:4018
export MAILER_TOKEN=your-token

node server.js
```

---

## API 端點

### 公開
- `GET /` — 表單頁面
- `GET /api/config` — 表單設定（僅欄位）
- `POST /api/submit` — 提交表單
- `POST /api/upload` — 代理上傳至 Pokkit

### Admin（需要 `x-admin-password` header 或 `?pw=` 參數）
- `GET /admin.html` — 管理後台
- `GET /api/admin/stats` — 投件統計
- `GET /api/admin/submissions` — 所有投件及 metadata
- `GET /api/admin/export` — 下載 CSV
- `POST /api/admin/send-email` — 發信給投件者

---

## 使用場景

- **招募** — 收履歷和作品集
- **作業收件** — 學生繳交作業
- **文章投稿** — 作者投稿
- **活動報名** — 自訂欄位的報名表
- **客戶需求** — 服務諮詢表單

---

## License

MIT

---

[CloudPipe](https://github.com/nicejeffbb/cloudpipe) 生態系的一員。
