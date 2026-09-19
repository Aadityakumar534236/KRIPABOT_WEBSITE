import { localStorageProvider } from './localStorage.js'
import { appsScriptStorageProvider } from './appsScriptStorage.js'

/**
 * Stable storage boundary. Media records keep provider + storageKey, never a credential.
 * Add cloud providers here without changing CMS routes or UI.
 */
export function getStorageProvider(name) {
  const provider = (name || process.env.STORAGE_PROVIDER || 'local').toLowerCase()
  // Legacy google-drive values are deliberately routed through Apps Script now.
  // No service account, Google Cloud billing, or Drive API credentials are used.
  if (provider === 'google-drive') return appsScriptStorageProvider
  if (provider === 'apps-script') return appsScriptStorageProvider
  return localStorageProvider
}
