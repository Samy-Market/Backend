import { maskEmail, ResetRequestLimiter, resetIsUsable, sessionStillValid } from './password-reset';

describe('Recuperar contraseña: reglas', () => {
  const now = new Date('2026-11-12T12:00:00Z');

  it('el enlace sirve una sola vez y solo antes de vencer', () => {
    expect(resetIsUsable({ id: 'r', userId: 'u', expiresAt: new Date('2026-11-12T12:10:00Z'), usedAt: null }, now)).toBe(true);
    expect(resetIsUsable({ id: 'r', userId: 'u', expiresAt: new Date('2026-11-12T11:59:00Z'), usedAt: null }, now)).toBe(false);
    expect(resetIsUsable({ id: 'r', userId: 'u', expiresAt: new Date('2026-11-12T12:10:00Z'), usedAt: now }, now)).toBe(false);
    expect(resetIsUsable(null, now)).toBe(false);
  });

  it('las sesiones abiertas antes del cambio de contraseña dejan de valer', () => {
    const changed = new Date('2026-11-12T12:00:00.500Z');
    expect(sessionStillValid(null, 100)).toBe(true);
    expect(sessionStillValid(changed, now.getTime() / 1000 - 60)).toBe(false);
    expect(sessionStillValid(changed, now.getTime() / 1000)).toBe(true);
  });

  it('muestra el correo enmascarado', () => {
    expect(maskEmail('ana.torres@empresa.com')).toBe('an••••••@empresa.com');
    expect(maskEmail('al@x.com')).toBe('a•@x.com');
  });

  it('limita las solicitudes por correo y por conexión', () => {
    const l = new ResetRequestLimiter(2, 3, 60_000);
    expect(l.allow('a@x.com', 'ip', 0)).toEqual({ ip: true, email: true });
    expect(l.allow('a@x.com', 'ip', 1)).toEqual({ ip: true, email: true });
    expect(l.allow('A@x.com', 'ip', 2)).toEqual({ ip: true, email: false });
    expect(l.allow('b@x.com', 'ip', 3)).toEqual({ ip: false, email: false });
    expect(l.allow('a@x.com', 'otra', 70_000)).toEqual({ ip: true, email: true });
  });
});
