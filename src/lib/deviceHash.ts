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
  const salt: string = import.meta.env.VITE_DEVICE_HASH_SALT ?? 'fuelbot-salt'
  if (!salt || salt === 'fuelbot-salt' || salt === 'change-me-to-random-string') {
    console.error(
      '[FuelBot] VITE_DEVICE_HASH_SALT is unset or using a default value. ' +
      'Set a cryptographically random 32+ character string in your Vercel environment variables.',
    )
  }
  const data = encoder.encode(token + salt)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
