/** Zona horaria del negocio: define qué es "hoy" y las horas que ve la gente. */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Guayaquil';
/** Horas tras las cuales un ingreso sin salida se da por jornada abandonada. */
export const MAX_SESSION_HOURS = Number(process.env.MAX_SESSION_HOURS || 16);

/** Orígenes permitidos (frontend) para la API y el canal en vivo. */
export function corsOrigins(): string[] {
  return (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}
