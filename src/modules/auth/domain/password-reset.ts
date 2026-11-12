export interface ResetRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export const RESET_INVALID = 'El enlace no es válido o ya venció. Pide uno nuevo desde "¿Olvidaste tu contraseña?".';

export function resetIsUsable(r: ResetRecord | null, now: Date): r is ResetRecord {
  return !!r && !r.usedAt && r.expiresAt > now;
}

/** Los tokens emitidos antes del último cambio de contraseña ya no sirven. */
export function sessionStillValid(passwordChangedAt: Date | null, issuedAtSeconds: number | undefined): boolean {
  if (!passwordChangedAt || issuedAtSeconds === undefined) return true;
  return issuedAtSeconds >= Math.floor(passwordChangedAt.getTime() / 1000);
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  const visible = user.length <= 2 ? user[0] : user.slice(0, 2);
  return `${visible}${'•'.repeat(Math.max(1, Math.min(6, user.length - visible.length)))}@${domain}`;
}

export function resetEmail(link: string, minutes: number) {
  const subject = 'Restablece tu contraseña de SAMY';
  const text = [
    'Hola:',
    '',
    'Recibimos una solicitud para restablecer tu contraseña de SAMY Asistencia.',
    `Abre este enlace para crear una nueva (vale por ${minutes} minutos y se puede usar una sola vez):`,
    '',
    link,
    '',
    'Si no lo pediste, ignora este correo: tu contraseña no cambia.',
  ].join('\n');
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f5f5f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1d1d1f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:18px;padding:32px">
<tr><td style="font-size:22px;font-weight:600;padding-bottom:12px">Restablece tu contraseña</td></tr>
<tr><td style="font-size:15px;line-height:1.5;color:#3a3a3c;padding-bottom:24px">Recibimos una solicitud para restablecer tu contraseña de SAMY Asistencia. El enlace vale por ${minutes} minutos y se puede usar una sola vez.</td></tr>
<tr><td align="center" style="padding-bottom:24px"><a href="${link}" style="display:inline-block;background:#0058e0;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:999px">Crear nueva contraseña</a></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#6e6e73">Si el botón no funciona, copia este enlace en el navegador:<br><span style="word-break:break-all">${link}</span></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#6e6e73;padding-top:16px">Si no lo pediste, ignora este correo: tu contraseña no cambia.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}

/** Cuántas veces se puede pedir el correo, para que no se use para mandar correos masivos. */
export class ResetRequestLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private perEmail: number,
    private perIp: number,
    private windowMs: number,
  ) {}

  allow(email: string, ip: string, now: number): { ip: boolean; email: boolean } {
    const ipOk = this.take(`i:${ip}`, this.perIp, now);
    const emailOk = ipOk && this.take(`e:${email.trim().toLowerCase()}`, this.perEmail, now);
    return { ip: ipOk, email: emailOk };
  }

  private take(key: string, max: number, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    if (recent.length >= max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}
