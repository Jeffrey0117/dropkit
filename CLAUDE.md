# DropKit

Config-driven submission portal — define fields in one config file, get a working form + admin dashboard.

## Stack
- **Runtime**: Node.js (pure, no framework — built on `http`)
- **Language**: JavaScript (CommonJS)
- **Frontend**: Static HTML in `public/` (vanilla, dark theme), form auto-rendered from `/api/config`
- **Storage**: Flat JSON file (`data/submissions.json`)
- **External services**: Pokkit (file uploads), Mailer (email sending) — proxied via HTTP
- **Process manager**: PM2 (`ecosystem.config.js`)
- Zero npm dependencies (only `package-lock.json` lockfile)

## Directory structure

```
server.js              ← Entire backend: HTTP server, routes, validation, CSV, email
dropkit.config.js      ← Single source of truth: title, fields, admin password, service URLs
ecosystem.config.js    ← PM2 app definition (name: dropkit, PORT 4021)
public/
  index.html           ← Public form page (renders fields from config)
  admin.html           ← Admin dashboard (submissions, CSV export, email)
data/
  submissions.json     ← Persisted submissions (auto-created)
```

## Key concepts

- **Config-driven**: Edit `dropkit.config.js` `fields[]` → form UI and validation auto-generate. Field types: `text`, `email`, `textarea`, `select` (needs `options`), `file` (needs Pokkit).
- **Submission flow**: Browser → `POST /api/submit` → validate against config fields (rejects unknown fields, required checks, email regex, 10k char cap) → append to `submissions.json` with `id`/`ip`/`createdAt`.
- **File uploads**: `POST /api/upload` proxies multipart body to `${pokkitUrl}/upload` (Bearer auth via `pokkitAuth`), enforces `maxFileSize`.
- **Email**: `POST /api/admin/send-email` resolves recipient emails (from IDs, all submissions, or a custom list), dedupes, sends each via `${mailerUrl}/api/send`.
- **Admin auth**: `x-admin-password` header or `?pw=` query param compared against `config.adminPassword`. Protects `/api/admin/*`.
- **Rate limiting**: In-memory `Map` per IP, 10 submissions/hour (rolling window). Resets on restart.
- **CSV export**: `/api/admin/export` builds Excel-friendly CSV (UTF-8 BOM, RFC-style quoting).

## Configuration (env vars override config defaults)

| Var | Purpose | Default |
|-----|---------|---------|
| `PORT` | Server port | 4021 |
| `ADMIN_PASSWORD` | Admin dashboard password | `dropkit2024` |
| `POKKIT_URL` / `POKKIT_AUTH` | File upload service | `http://localhost:4009` / "" |
| `MAILER_URL` / `MAILER_TOKEN` | Email service | `http://localhost:4018` / "" |

## Commands

| Command | Description |
|---------|-------------|
| `npm start` | Run server (`node server.js`) |
| `node server.js` | Start directly |
| `pm2 start ecosystem.config.js` | Run under PM2 (production) |

No build, lint, or test scripts are defined.

## Endpoints

- Public: `GET /`, `GET /api/health`, `GET /api/config`, `POST /api/submit`, `POST /api/upload`
- Admin: `GET /admin.html`, `GET /api/admin/stats`, `GET /api/admin/submissions`, `GET /api/admin/export`, `POST /api/admin/send-email`

## Coding rules

- Pure Node.js stdlib — avoid adding framework/dependencies; keep the zero-dep footprint.
- Immutability: server uses spread (`{...body}`, `[...submissions]`) rather than mutating — follow this.
- All admin routes must call `checkAdmin(req, url)` before returning data.
- Validate every submission field against `config.fields`; reject unknown keys.
- Part of the CloudPipe ecosystem; new service integrations follow the HTTP-proxy pattern (config URL + optional Bearer token).
