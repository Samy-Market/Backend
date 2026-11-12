export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Guayaquil';
export const MAX_SESSION_HOURS = Number(process.env.MAX_SESSION_HOURS || 16);

export function sessionIdleMinutes(role: string): number {
  const staff = role === 'ADMIN' || role === 'SUPERVISOR';
  const raw = staff ? process.env.SESSION_IDLE_MINUTES_STAFF : process.env.SESSION_IDLE_MINUTES_EMPLOYEE;
  const value = Number(raw ?? (staff ? 30 : 10));
  return Number.isFinite(value) && value >= 0 ? value : staff ? 30 : 10;
}

function positive(raw: string | undefined, fallback: number): number {
  const value = Number(raw ?? fallback);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

export function loginThrottleRules() {
  return {
    maxPerEmail: positive(process.env.LOGIN_MAX_ATTEMPTS, 5),
    maxPerIp: positive(process.env.LOGIN_MAX_ATTEMPTS_PER_IP, 20),
    windowMinutes: positive(process.env.LOGIN_WINDOW_MINUTES, 15),
    lockMinutes: positive(process.env.LOGIN_LOCK_MINUTES, 15),
  };
}

export function mailSettings() {
  return {
    brevoApiKey: process.env.BREVO_API_KEY?.trim() || null,
    fromEmail: process.env.MAIL_FROM_EMAIL?.trim() || null,
    fromName: process.env.MAIL_FROM_NAME?.trim() || 'SAMY Asistencia',
  };
}

export function appUrl(): string {
  return (process.env.APP_URL || corsOrigins()[0] || 'http://localhost:5173').replace(/\/$/, '');
}

export const PASSWORD_RESET_MINUTES = positive(process.env.PASSWORD_RESET_MINUTES, 30);

export function corsOrigins(): string[] {
  return (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}
