import { Role } from '../../../shared/domain/roles';
import { Account } from '../domain/account';
import { LoginThrottle } from '../domain/login-throttle';
import { AuthService } from './auth.service';
import { AccountRepository } from './ports/account.repository';

const account: Account = {
  id: 'u1',
  email: 'ana@empresa.com',
  role: Role.EMPLOYEE,
  active: true,
  passwordHash: 'hash:Clave-123',
  passwordChangedAt: null,
  employee: null,
};

const hasher = { hash: (p: string) => Promise.resolve(`hash:${p}`), verify: (p: string, h: string) => Promise.resolve(h === `hash:${p}`) };
const accounts = {
  findByEmail: (email: string) => Promise.resolve(email === account.email ? account : null),
  findById: () => Promise.resolve(account),
  updatePassword: jest.fn((_id: string, hash: string) => {
    account.passwordHash = hash;
    return Promise.resolve();
  }),
  profile: () => Promise.resolve({ id: 'u1', email: account.email, role: Role.EMPLOYEE, active: true, employee: null }),
};
const tokens = { sign: () => Promise.resolve('token'), verify: () => Promise.resolve(null) };

const clock = { now: () => new Date(0), today: () => '1970-01-01' };
const rules = { maxPerEmail: 5, maxPerIp: 20, windowMinutes: 15, lockMinutes: 15 };
const audit = { record: jest.fn(() => Promise.resolve()) };
const build = () => new AuthService(accounts as unknown as AccountRepository, hasher, tokens, new LoginThrottle(rules), clock, audit);
let service = build();
beforeEach(() => (service = build()));

describe('Inicio de sesión', () => {
  it('entra con la contraseña exacta y devuelve el tiempo de inactividad permitido', async () => {
    const res = await service.login('ana@empresa.com', 'Clave-123', '1.1.1.1');
    expect(res.accessToken).toBe('token');
    expect(res.user.session.idleMinutes).toBe(10);
  });

  it('tolera espacios o saltos de línea pegados al inicio o al final', async () => {
    await expect(service.login('ana@empresa.com', ' Clave-123\n', '1.1.1.1')).resolves.toMatchObject({ accessToken: 'token' });
  });

  it('rechaza una contraseña distinta', async () => {
    await expect(service.login('ana@empresa.com', 'clave-123', '1.1.1.1')).rejects.toThrow('Correo o contraseña incorrectos.');
    await expect(service.login('otra@empresa.com', 'Clave-123', '1.1.1.1')).rejects.toThrow('Correo o contraseña incorrectos.');
  });
});

describe('Bloqueo por intentos fallidos', () => {
  it('avisa cuando quedan pocos intentos y luego bloquea incluso con la contraseña correcta', async () => {
    for (let i = 0; i < 3; i++) await service.login('ana@empresa.com', 'mala', '1.1.1.1').catch(() => undefined);
    await expect(service.login('ana@empresa.com', 'mala', '1.1.1.1')).rejects.toThrow('Te queda 1 intento');
    await expect(service.login('ana@empresa.com', 'mala', '1.1.1.1')).rejects.toThrow('Demasiados intentos fallidos. Espera 15 minutos');
    await expect(service.login('ana@empresa.com', 'Clave-123', '2.2.2.2')).rejects.toThrow('Demasiados intentos fallidos');
  });
});

describe('Cambiar mi contraseña', () => {
  afterEach(() => (account.passwordHash = 'hash:Clave-123'));

  it('exige la contraseña actual y una nueva distinta', async () => {
    await expect(service.changePassword('u1', 'otra', 'Nueva-123', '1.1.1.1')).rejects.toThrow('La contraseña actual no es correcta.');
    await expect(service.changePassword('u1', 'Clave-123', 'Clave-123', '1.1.1.1')).rejects.toThrow('distinta de la actual');
  });

  it('guarda la nueva, deja registro y permite entrar con ella', async () => {
    await expect(service.changePassword('u1', 'Clave-123', 'Nueva-123', '1.1.1.1')).resolves.toEqual({ ok: true, accessToken: 'token' });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'CHANGE_PASSWORD', entityId: 'u1' }));
    await expect(service.login('ana@empresa.com', 'Nueva-123', '1.1.1.1')).resolves.toMatchObject({ accessToken: 'token' });
    await expect(service.login('ana@empresa.com', 'Clave-123', '1.1.1.1')).rejects.toThrow('Correo o contraseña incorrectos.');
  });

  it('bloquea tras varios intentos con la actual equivocada', async () => {
    for (let i = 0; i < 4; i++) await service.changePassword('u1', 'mala', 'Nueva-123', '1.1.1.1').catch(() => undefined);
    await expect(service.changePassword('u1', 'mala', 'Nueva-123', '1.1.1.1')).rejects.toThrow('Demasiados intentos fallidos');
  });
});
