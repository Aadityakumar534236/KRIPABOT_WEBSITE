import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
const uploadDir = path.resolve('server/uploads')
const safeName = (name) => crypto.randomUUID() + path.extname(name || '').toLowerCase()
export const localStorageProvider = {
  name: 'local',
  async upload(file) { await fs.mkdir(uploadDir, { recursive: true }); const key = safeName(file.originalName); await fs.writeFile(path.join(uploadDir, key), file.buffer); return { provider: 'local', storageKey: key, url: `/uploads/${key}` } },
  async delete(key) { await fs.unlink(path.join(uploadDir, path.basename(key))).catch(() => {}) },
  async get(key) { return { buffer: await fs.readFile(path.join(uploadDir, path.basename(key))) } },
  getPublicUrl(key) { return `/uploads/${key}` },
  async list() { return (await fs.readdir(uploadDir).catch(() => [])).map(storageKey => ({ storageKey, provider: 'local' })) }
}
