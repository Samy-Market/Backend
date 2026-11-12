import { RealtimeNotifier } from '../../../shared/application/ports/realtime-notifier';
import { Role } from '../../../shared/domain/roles';
import { Account } from '../domain/account';
import { LoginThrottle } from '../domain/login-throttle';
import { ResetRecord } from '../domain/password-reset';
import { PasswordResetService } from './password-reset.service';
import { AccountRepository } from './ports/account.repository';

const now = new Date('2026-11-12T12:00:00Z');

function setup(active = true) {
  const account: Account = {
    id: 'u1',
    email: 'ana@empresa.com',
    role: Role.EMPLOYEE,
    active,
    passwordHash: 'hash:vieja',
    passwordChangedAt: null,
    employee: null,
  };
  const resets = new Map<string, ResetRecord & { hash: string }>();
  const accounts = {
    findByEmail: (e: string) => Promise.resolve(e === account.email ? account : null),
    findById: () => Promise.resolve(account),
    createReset: (userId: string, hash: string, expiresAt: Date) => {
      resets.clear();
      resets.set(hash, { id: `r-${hash}`, userId, expiresAt, usedAt: null, hash });
      return Promise.resolve();
    },
    findReset: (hash: string) => Promise.resolve(resets.get(hash) ?? null),
    completeReset: (id: string, _u: string, passwordHash: string, at: Date) => {
      const r = [...resets.values()].find((x) => x.id === id);
      if (!r || r.usedAt) return Promise.resolve(false);
      r.usedAt = at;
      account.passwordHash = passwordHash;
      account.passwordChangedAt = at;
      return Promise.resolve(true);
    },
  };
  let n = 0;
  const tokens = { generate: () => ({ token: `tok${++n}`, hash: `h:tok${n}` }), hash: (t: string) => `h:${t}` };
  const sent: { to: string; text: string }[] = [];
  const mailer = { send: (m: { to: string; text: string }) => (sent.push(m), Promise.resolve()) };
  const clock = { now: () => now, today: () => '2026-11-12' };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const hasher = { hash: (p: string) => Promise.resolve(`hash:${p}`), verify: () => Promise.resolve(false) };
  const throttle = new LoginThrottle({ maxPerEmail: 5, maxPerIp: 20, windowMinutes: 15, lockMinutes: 15 });
  const realtime = { disconnectUser: jest.fn() } as unknown as RealtimeNotifier;
  const service = new PasswordResetService(
    accounts as unknown as AccountRepository,
    tokens,
    hasher,
    mailer,
    clock,
    audit,
    throttle,
    realtime,
  );
  return { service, account, sent, audit };
}

describe('Recuperar contraseña', () => {
  it('a un correo desconocido o inactivo responde igual, sin enviar nada', async () => {
    const { service, sent } = setup();
    await expect(service.request('nadie@empresa.com', '1.1.1.1')).resolves.toEqual({ ok: true });
    expect(sent).toHaveLength(0);
    const inactive = setup(false);
    await expect(inactive.service.request('ana@empresa.com', '1.1.1.1')).resolves.toEqual({ ok: true });
    expect(inactive.sent).toHaveLength(0);
  });

  it('envía el enlace, lo valida, cambia la contraseña y no deja reutilizarlo', async () => {
    const { service, sent, account, audit } = setup();
    await service.request('ana@empresa.com', '1.1.1.1');
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('ana@empresa.com');
    const token = /token=([^\s]+)/.exec(sent[0].text)![1];

    await expect(service.check(token)).resolves.toEqual({ valid: true, email: 'an•@empresa.com' });
    await expect(service.reset(token, 'Nueva-123')).resolves.toEqual({ ok: true });
    expect(account.passwordHash).toBe('hash:Nueva-123');
    expect(account.passwordChangedAt).toEqual(now);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'PASSWORD_RESET' }));

    await expect(service.check(token)).resolves.toEqual({ valid: false });
    await expect(service.reset(token, 'Otra-1234')).rejects.toThrow('no es válido o ya venció');
  });

  it('un enlace nuevo anula el anterior y uno inventado no sirve', async () => {
    const { service, sent } = setup();
    await service.request('ana@empresa.com', '1.1.1.1');
    await service.request('ana@empresa.com', '1.1.1.1');
    const [first, second] = sent.map((m) => /token=([^\s]+)/.exec(m.text)![1]);
    await expect(service.check(first)).resolves.toEqual({ valid: false });
    await expect(service.check(second)).resolves.toMatchObject({ valid: true });
    await expect(service.reset('inventado', 'Nueva-123')).rejects.toThrow('no es válido');
  });

  it('limita: más de 3 pedidos del mismo correo en una hora no envían más', async () => {
    const { service, sent } = setup();
    for (let i = 0; i < 5; i++) await service.request('ana@empresa.com', `ip${i}`);
    expect(sent).toHaveLength(3);
  });
});
