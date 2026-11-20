require('./lib/env').loadEnv()

module.exports = {
  title: 'Join Our Team',
  description: 'Fill out the form below to apply',
  // 不給預設值: 舊的 'dropkit2024' 寫在公開 repo 裡。沒設 = 後台整個關閉 (見 server.js)
  adminPassword: process.env.ADMIN_PASSWORD || '',
  port: process.env.PORT || 4021,
  pokkitUrl: process.env.POKKIT_URL || 'http://localhost:4009',
  pokkitAuth: process.env.POKKIT_AUTH || '',
  mailerUrl: process.env.MAILER_URL || 'http://localhost:4018',
  mailerToken: process.env.MAILER_TOKEN || '',

  fields: [
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'role', label: 'Position', type: 'select', options: ['Developer', 'Designer', 'PM'], required: true },
    { name: 'intro', label: 'About You', type: 'textarea' },
    { name: 'resume', label: 'Resume', type: 'file', accept: '.pdf,.doc,.docx' },
  ],

  successMessage: 'Thanks! We received your application.',
  maxFileSize: 10 * 1024 * 1024,
}
