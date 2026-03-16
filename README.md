# DropKit

**Config-driven submission portal** — turn any idea into a working form in minutes.

<p align="center">
  <strong>English</strong> | <a href="./README.zh-TW.md">繁體中文</a>
</p>

Built for recruiting, homework collection, article submissions, event registration, and client requests. Just edit the config, deploy, and you're live.

## Features

- **Zero-config form rendering** — define fields in `dropkit.config.js`, UI auto-generates
- **File upload support** — proxies to Pokkit for seamless attachment handling
- **Admin dashboard** — view submissions, export CSV, send emails (single or bulk)
- **Email integration** — powered by Mailer service for applicant follow-up
- **Rate limiting** — 10 submissions per IP per hour
- **Dark theme** — matching canweback aesthetic
- **Pure Node.js** — no framework overhead

## Quick Start

```bash
npm install
pm2 start ecosystem.config.js
```

Visit `http://localhost:4021` for the form, `/admin.html` for the dashboard.

## Configuration

Edit `dropkit.config.js` to customize:

```javascript
module.exports = {
  title: 'Join Our Team',
  description: 'Fill out the form below to apply',
  adminPassword: 'your-secure-password',
  port: 4021,

  fields: [
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'role', label: 'Position', type: 'select', options: ['Developer', 'Designer', 'PM'], required: true },
    { name: 'intro', label: 'About You', type: 'textarea' },
    { name: 'resume', label: 'Resume', type: 'file', accept: '.pdf,.doc,.docx' },
  ],

  successMessage: 'Thanks! We received your application.',
  maxFileSize: 10 * 1024 * 1024, // 10MB
}
```

### Field Types

- `text` — Single line input
- `email` — Email validation
- `textarea` — Multi-line input
- `select` — Dropdown (requires `options` array)
- `file` — File upload (requires Pokkit service)

## Admin Dashboard

Access at `/admin.html` with the password from config.

Features:
- View all submissions with timestamp
- Export to CSV (Excel-compatible UTF-8 BOM)
- Select submissions and send emails
- Broadcast to all submitters

## Architecture

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  DropKit    │ ← config-driven form + admin
│  (4021)     │
└──────┬──────┘
       │
       ├─────▶ Pokkit (4009)   [file uploads]
       └─────▶ Mailer (4018)   [email sending]
```

## Deployment

### CloudPipe (Recommended)

1. Push to GitHub
2. Register in CloudPipe projects
3. Gateway auto-proxies via subdomain

### Standalone

```bash
# Set environment variables
export ADMIN_PASSWORD=your-password
export POKKIT_URL=http://localhost:4009
export POKKIT_AUTH=Bearer your-key
export MAILER_URL=http://localhost:4018
export MAILER_TOKEN=your-token

# Start
node server.js
```

## API Endpoints

### Public
- `GET /` — Form page
- `GET /api/config` — Form config (fields only)
- `POST /api/submit` — Submit form data
- `POST /api/upload` — Proxy file upload to Pokkit

### Admin (requires `x-admin-password` header or `?pw=` query param)
- `GET /admin.html` — Admin dashboard
- `GET /api/admin/stats` — Submission statistics
- `GET /api/admin/submissions` — All submissions with metadata
- `GET /api/admin/export` — Download CSV
- `POST /api/admin/send-email` — Send email to submitters

## Use Cases

- **Recruiting** — collect resumes and portfolios
- **Homework** — students submit assignments
- **Articles** — writers pitch ideas
- **Events** — registration with custom fields
- **Client Intake** — service request forms

## License

MIT

---

Part of the [CloudPipe](https://github.com/yourusername/cloudpipe) ecosystem.
