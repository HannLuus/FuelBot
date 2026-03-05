/**
 * Generates a privacy-safe device fingerprint stored in localStorage.
 * Uses a stable random token rather than tracking real device attributes.
 */
const DEVICE_TOKEN_KEY = 'fuelbot_device_token'

function getOrCreateDeviceToken(): string {
  let token = localStorage.getItem(DEVICE_TOKEN_KEY)
  if (!token) {
    token = crypto.randomUUID()
    localStorage.setItem(DEVICE_TOKEN_KEY, token)
  }
  return token
}

export async function getDeviceHash(): Promise<string> {
  const token = getOrCreateDeviceToken()
  const encoder = new TextEncoder()
  const salt = import.meta.env.VITE_DEVICE_HASH_SALT ?? 'fuelbot-salt'
  const data = encoder.encode(token + salt)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
