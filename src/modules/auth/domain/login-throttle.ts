export interface LoginThrottleRules {
  maxPerEmail: number;
  maxPerIp: number;
  windowMinutes: number;
  lockMinutes: number;
}

interface Bucket {
  failures: number[];
  lockedUntil: number;
}

export type ThrottleVerdict = { allowed: true } | { allowed: false; retryInMinutes: number };

/**
 * Cuenta solo intentos fallidos, por correo y por IP. Al llegar al máximo bloquea ese correo o IP
 * durante `lockMinutes`, incluso con la contraseña correcta, para no confirmar al atacante cuál era.
 * Vive en memoria: con varias instancias de la API, cada una lleva su propia cuenta.
 */
export class LoginThrottle {
  private buckets = new Map<string, Bucket>();
  private calls = 0;

  constructor(private rules: LoginThrottleRules) {}

  check(email: string, ip: string, now: number): ThrottleVerdict {
    const until = Math.max(this.lockedUntil(emailKey(email), now), this.lockedUntil(ipKey(ip), now));
    if (until <= now) return { allowed: true };
    return { allowed: false, retryInMinutes: Math.max(1, Math.ceil((until - now) / 60_000)) };
  }

  fail(email: string, ip: string, now: number): number {
    this.sweep(now);
    const left = this.record(emailKey(email), this.rules.maxPerEmail, now);
    this.record(ipKey(ip), this.rules.maxPerIp, now);
    return left;
  }

  succeed(email: string): void {
    this.buckets.delete(emailKey(email));
  }

  private record(key: string, max: number, now: number): number {
    const bucket = this.buckets.get(key) ?? { failures: [], lockedUntil: 0 };
    bucket.failures = bucket.failures.filter((t) => t > now - this.rules.windowMinutes * 60_000);
    bucket.failures.push(now);
    if (bucket.failures.length >= max) {
      bucket.lockedUntil = now + this.rules.lockMinutes * 60_000;
      bucket.failures = [];
    }
    this.buckets.set(key, bucket);
    return bucket.lockedUntil > now ? 0 : max - bucket.failures.length;
  }

  private lockedUntil(key: string, now: number): number {
    const until = this.buckets.get(key)?.lockedUntil ?? 0;
    return until > now ? until : 0;
  }

  private sweep(now: number): void {
    if (++this.calls % 200 !== 0) return;
    const oldest = now - this.rules.windowMinutes * 60_000;
    for (const [key, b] of this.buckets) {
      if (b.lockedUntil <= now && b.failures.every((t) => t <= oldest)) this.buckets.delete(key);
    }
  }
}

const emailKey = (email: string) => `e:${email.trim().toLowerCase()}`;
const ipKey = (ip: string) => `i:${ip}`;
