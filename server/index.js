import 'dotenv/config'

import bcrypt from 'bcryptjs'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import jwt from 'jsonwebtoken'
import multer from 'multer'

import { analyzeMedia } from './ai.js'
import { db, save } from './storage.js'
import { getStorageProvider } from './providers/storage.js'

const app = express()
const port = process.env.PORT || 3001
const secret = process.env.JWT_SECRET
const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'server/uploads')
const distDir = path.resolve('dist')

fs.mkdirSync(uploadDir, { recursive: true })

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
])
const collectionFields = {
  media: ['title', 'description', 'category', 'tags', 'altText', 'published'],
  achievements: [
    'eventName',
    'year',
    'category',
    'result',
    'score',
    'location',
    'description',
    'officialSourceUrl',
    'published',
  ],
  projects: ['name', 'description', 'status'],
  team: ['name', 'role'],
}
const categorySet = new Set(['Robot', 'Competition', 'WRO', 'Team', 'School', 'Events', 'Project', 'Other'])
const loginAttempts = new Map()

const maxUploadBytes = Math.max(1, Number(process.env.MAX_UPLOAD_MB) || 20) * 1024 * 1024
const appsBridgeBytes = Math.max(1, Number(process.env.APPS_SCRIPT_MAX_BRIDGE_MB) || 4) * 1024 * 1024
const uploadLimit =
  (process.env.STORAGE_PROVIDER || 'local').toLowerCase() === 'apps-script'
    ? Math.min(maxUploadBytes, appsBridgeBytes)
    : maxUploadBytes

app.disable('x-powered-by')
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Frame-Options', 'DENY')

  const origin = process.env.FRONTEND_ORIGIN
  if (origin && req.headers.origin === origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS')
  }
  if (req.method === 'OPTIONS') return res.status(204).end()
  next()
})
app.use(express.json({ limit: '1mb' }))
app.use('/uploads', express.static(uploadDir, {
  immutable: true,
  maxAge: '1h',
  setHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff')
  },
}))

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: uploadLimit, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      cb(new Error('Unsupported file type. Upload JPG, PNG, WebP, GIF, MP4, WebM, or MOV files.'))
      return
    }
    cb(null, true)
  },
})

function sendError(res, status, error) {
  res.status(status).json({ error })
}

function auth(req, res, next) {
  if (!secret || secret.length < 24) {
    return sendError(res, 503, 'Admin authentication is not configured securely.')
  }

  try {
    req.user = jwt.verify((req.headers.authorization || '').replace(/^Bearer\s+/i, ''), secret)
    next()
  } catch {
    sendError(res, 401, 'Authentication required')
  }
}

function text(value, max, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new Error('A required field is missing.')
    return ''
  }
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('Invalid text field.')
  const cleaned = String(value).trim().slice(0, max)
  if (required && !cleaned) throw new Error('A required field is missing.')
  return cleaned
}

function bool(value) {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function url(value, max = 400) {
  const cleaned = text(value, max)
  if (!cleaned) return ''
  try {
    const parsed = new URL(cleaned)
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) throw new Error()
    return cleaned
  } catch {
    throw new Error('Enter a valid URL.')
  }
}

function email(value) {
  const cleaned = text(value, 160)
  if (!cleaned) return ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) throw new Error('Enter a valid email address.')
  return cleaned
}

function tags(value) {
  if (Array.isArray(value)) {
    return value.map(item => text(item, 40)).filter(Boolean).slice(0, 10)
  }
  if (typeof value === 'string') {
    return value.split(',').map(item => text(item, 40)).filter(Boolean).slice(0, 10)
  }
  return []
}

function sanitizeCollection(collection, body, existing = {}) {
  if (!collectionFields[collection]) throw new Error('Unknown collection')

  if (collection === 'media') {
    const out = {}
    if ('title' in body) out.title = text(body.title, 120)
    if ('description' in body) out.description = text(body.description, 600)
    if ('category' in body) out.category = text(body.category, 40) || 'Other'
    if ('tags' in body) out.tags = tags(body.tags)
    if ('altText' in body) out.altText = text(body.altText, 250)
    if ('published' in body) out.published = Boolean(body.published)
    return out
  }

  if (collection === 'achievements') {
    return {
      eventName: text(body.eventName ?? existing.eventName, 120, { required: !existing.id }),
      year: text(body.year ?? existing.year, 20),
      category: text(body.category ?? existing.category, 80),
      result: text(body.result ?? existing.result, 120),
      score: text(body.score ?? existing.score, 80),
      location: text(body.location ?? existing.location, 120),
      description: text(body.description ?? existing.description, 600),
      officialSourceUrl: url(body.officialSourceUrl ?? existing.officialSourceUrl),
      published: bool(body.published) ?? existing.published ?? true,
    }
  }

  if (collection === 'projects') {
    return {
      name: text(body.name ?? existing.name, 120, { required: !existing.id }),
      description: text(body.description ?? existing.description, 800),
      status: text(body.status ?? existing.status, 80),
    }
  }

  return {
    name: text(body.name ?? existing.name, 100, { required: !existing.id }),
    role: text(body.role ?? existing.role, 120),
  }
}

function sanitizeConfig(key, value) {
  if (key === 'links') {
    return {
      instagram: url(value?.instagram),
      youtube: url(value?.youtube),
      wro: url(value?.wro),
      email: email(value?.email),
    }
  }
  if (key === 'settings') {
    return {
      heroText: text(value?.heroText, 220, { required: true }),
    }
  }
  if (key === 'categories') {
    if (!Array.isArray(value)) throw new Error('Categories must be a JSON array.')
    const cleaned = value.map(item => text(item, 40)).filter(Boolean).slice(0, 20)
    return [...new Set(cleaned.length ? cleaned : ['Other'])]
  }
  throw new Error('Unknown config')
}

function loginIsLimited(key) {
  const now = Date.now()
  const record = loginAttempts.get(key) || { count: 0, resetAt: now + 10 * 60 * 1000 }
  if (record.resetAt <= now) {
    loginAttempts.set(key, { count: 0, resetAt: now + 10 * 60 * 1000 })
    return false
  }
  return record.count >= 8
}

function recordLoginFailure(key) {
  const now = Date.now()
  const record = loginAttempts.get(key) || { count: 0, resetAt: now + 10 * 60 * 1000 }
  record.count += 1
  loginAttempts.set(key, record)
}

async function passwordMatches(candidate) {
  const hash = process.env.ADMIN_PASSWORD_HASH
  if (hash) return bcrypt.compare(String(candidate || ''), hash)

  const configured = process.env.ADMIN_PASSWORD || ''
  if (configured.startsWith('$2a$') || configured.startsWith('$2b$') || configured.startsWith('$2y$')) {
    return bcrypt.compare(String(candidate || ''), configured)
  }
  return String(candidate || '') === configured
}

app.get('/api/public', (_req, res) => {
  const value = db()
  res.json({
    media: value.media.filter(item => item.published),
    achievements: value.achievements.filter(item => item.published !== false),
    projects: value.projects,
    team: value.team,
    links: value.links,
    settings: value.settings,
    categories: value.categories,
  })
})

app.post('/api/auth/login', async (req, res) => {
  if (!secret || secret.length < 24 || !process.env.ADMIN_EMAIL || (!process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD_HASH)) {
    return sendError(res, 503, 'Admin login is not configured. Set ADMIN_EMAIL, ADMIN_PASSWORD or ADMIN_PASSWORD_HASH, and a long JWT_SECRET.')
  }

  const limiterKey = `${req.ip}:${String(req.body?.email || '').toLowerCase()}`
  if (loginIsLimited(limiterKey)) return sendError(res, 429, 'Too many login attempts. Try again later.')

  const email = text(req.body?.email, 180).toLowerCase()
  const configuredEmail = process.env.ADMIN_EMAIL.toLowerCase()
  if (email !== configuredEmail || !(await passwordMatches(req.body?.password))) {
    recordLoginFailure(limiterKey)
    return sendError(res, 401, 'Invalid email or password')
  }

  loginAttempts.delete(limiterKey)
  res.json({ token: jwt.sign({ role: 'admin' }, secret, { expiresIn: '8h' }) })
})

app.get('/api/admin/data', auth, (_req, res) => res.json(db()))

app.get('/api/admin/media/:id/preview', auth, async (req, res) => {
  const item = db().media.find(media => media.id === req.params.id)
  if (!item) return sendError(res, 404, 'Media not found.')
  if (!item.storageKey || !item.storageProvider) return sendError(res, 404, 'Preview unavailable for this media.')

  try {
    const file = await getStorageProvider(item.storageProvider).get(item.storageKey)
    res.setHeader('Content-Type', file.mimeType || item.mimeType || 'application/octet-stream')
    res.setHeader('Content-Disposition', 'inline')
    res.setHeader('Cache-Control', 'private, no-store')
    if (file.webStream) Readable.fromWeb(file.webStream).pipe(res)
    else res.end(file.buffer)
  } catch (error) {
    const message = String(error?.message || '')
    if (/size|limit|large/i.test(message)) return sendError(res, 413, 'Preview unavailable for this file size.')
    sendError(res, 502, 'Preview unavailable for this media.')
  }
})

app.get('/api/media/:provider/:key', async (req, res) => {
  const item = db().media.find(
    media => media.published && media.storageProvider === req.params.provider && media.storageKey === req.params.key,
  )
  if (!item) return res.status(404).end()

  try {
    const file = await getStorageProvider(req.params.provider).get(req.params.key)
    res.setHeader('Content-Type', file.mimeType || item.mimeType || 'application/octet-stream')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    if (file.webStream) Readable.fromWeb(file.webStream).pipe(res)
    else res.end(file.buffer)
  } catch {
    sendError(res, 502, 'Media is temporarily unavailable.')
  }
})

app.post('/api/admin/media', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return sendError(res, 400, 'Use a supported image/video under the size limit.')

  const provider = getStorageProvider()
  let stored
  try {
    stored = await provider.upload({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
    })
  } catch (error) {
    return sendError(res, 502, error.message || 'Media storage upload failed.')
  }

  const record = {
    id: crypto.randomUUID(),
    originalName: text(req.file.originalname, 180),
    url: stored.url,
    type: req.file.mimetype.startsWith('video/') ? 'video' : 'image',
    mimeType: req.file.mimetype,
    storageProvider: stored.provider,
    storageKey: stored.storageKey,
    createdAt: new Date().toISOString(),
    published: false,
    title: '',
    description: '',
    category: 'Other',
    tags: [],
    altText: '',
  }
  const suggested = await analyzeMedia(record, { buffer: req.file.buffer, mimeType: req.file.mimetype })
  Object.assign(record, {
    title: suggested.title,
    description: suggested.description,
    category: suggested.category,
    tags: suggested.tags,
    altText: suggested.altText,
    ai: suggested,
  })

  const value = db()
  value.media.unshift(record)
  save(value)
  res.status(201).json(record)
})

app.patch('/api/admin/:collection/:id', auth, (req, res) => {
  const value = db()
  const list = value[req.params.collection]
  if (!Array.isArray(list) || !collectionFields[req.params.collection]) return sendError(res, 404, 'Unknown collection')

  const item = list.find(entry => entry.id === req.params.id)
  if (!item) return sendError(res, 404, 'Not found')

  try {
    Object.assign(item, sanitizeCollection(req.params.collection, req.body, item), { id: item.id })
    save(value)
    res.json(item)
  } catch (error) {
    sendError(res, 400, error.message || 'Invalid data')
  }
})

app.post('/api/admin/:collection', auth, (req, res) => {
  const value = db()
  if (!Array.isArray(value[req.params.collection]) || !collectionFields[req.params.collection]) {
    return sendError(res, 404, 'Unknown collection')
  }

  try {
    const item = { id: crypto.randomUUID(), ...sanitizeCollection(req.params.collection, req.body) }
    value[req.params.collection].push(item)
    save(value)
    res.status(201).json(item)
  } catch (error) {
    sendError(res, 400, error.message || 'Invalid data')
  }
})

app.delete('/api/admin/:collection/:id', auth, async (req, res) => {
  const value = db()
  if (!Array.isArray(value[req.params.collection]) || !collectionFields[req.params.collection]) {
    return sendError(res, 404, 'Unknown collection')
  }

  const item = value[req.params.collection].find(entry => entry.id === req.params.id)
  if (req.params.collection === 'media' && item?.storageKey) {
    try {
      await getStorageProvider(item.storageProvider).delete(item.storageKey)
    } catch {
      return sendError(res, 502, 'Could not delete the stored media. The CMS record was kept.')
    }
  }

  value[req.params.collection] = value[req.params.collection].filter(entry => entry.id !== req.params.id)
  save(value)
  res.status(204).end()
})

app.put('/api/admin/config/:key', auth, (req, res) => {
  try {
    const value = db()
    value[req.params.key] = sanitizeConfig(req.params.key, req.body)
    save(value)
    res.json(value[req.params.key])
  } catch (error) {
    sendError(res, 400, error.message || 'Invalid config')
  }
})

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { maxAge: '1h' }))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next()
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? `Upload failed: file exceeds the ${Math.round(uploadLimit / 1024 / 1024)} MB limit.`
      : `Upload failed: ${err.message}`
    return sendError(res, 400, message)
  }
  if (err?.message?.startsWith('Unsupported file type')) return sendError(res, 400, err.message)
  sendError(res, 500, 'Server error')
})

app.listen(port, () => console.log(`KripaBot API listening on port ${port}`))
