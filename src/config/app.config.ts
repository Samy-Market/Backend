export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Guayaquil';
export const MAX_SESSION_HOURS = Number(process.env.MAX_SESSION_HOURS || 16);

export function sessionIdleMinutes(role: string): number {
  const staff = role === 'ADMIN' || role === 'SUPERVISOR';
  const raw = staff ? process.env.SESSION_IDLE_MINUTES_STAFF : process.env.SESSION_IDLE_MINUTES_EMPLOYEE;
  const value = Number(raw ?? (staff ? 30 : 10));
  return Number.isFinite(value) && value >= 0 ? value : staff ? 30 : 10;
}

export function corsOrigins(): string[] {
  return (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}
