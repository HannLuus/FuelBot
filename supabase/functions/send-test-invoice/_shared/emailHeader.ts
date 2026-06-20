export const RESEND_FROM = Deno.env.get('RESEND_FROM_EMAIL') ?? 'FuelBot <admin@fuelbotmm.com>';
const DEFAULT_APP_BASE_URL = 'https://fuelbotmm.com';
export function getAppBaseUrl() {
  const raw = Deno.env.get('APP_URL')?.trim();
  if (!raw) return DEFAULT_APP_BASE_URL;
  try {
    return new URL(raw).origin;
  } catch  {
    return DEFAULT_APP_BASE_URL;
  }
}
