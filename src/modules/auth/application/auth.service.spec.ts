import { Role } from '../../../shared/domain/roles';
import { Account } from '../domain/account';
import { AuthService } from './auth.service';
import { AccountRepository } from './ports/account.repository';

const account: Account = {
  id: 'u1',
  email: 'ana@empresa.com',
  role: Role.EMPLOYEE,
  active: true,
  passwordHash: 'hash:Clave-123',
  employee: null,
};

const hasher = { hash: (p: string) => Promise.resolve(`hash:${p}`), verify: (p: string, h: string) => Promise.resolve(h === `hash:${p}`) };
const accounts = {
  findByEmail: (email: string) => Promise.resolve(email === account.email ? account : null),
  findById: () => Promise.resolve(account),
  profile: () => Promise.resolve({ id: 'u1', email: account.email, role: Role.EMPLOYEE, active: true, employee: null }),
};
const tokens = { sign: () => Promise.resolve('token'), verify: () => Promise.resolve(null) };

const service = new AuthService(accounts as unknown as AccountRepository, hasher, tokens);

describe('Inicio de sesión', () => {
  it('entra con la contraseña exacta y devuelve el tiempo de inactividad permitido', async () => {
    const res = await service.login('ana@empresa.com', 'Clave-123');
    expect(res.accessToken).toBe('token');
    expect(res.user.session.idleMinutes).toBe(10);
  });

  it('tolera espacios o saltos de línea pegados al inicio o al final', async () => {
    await expect(service.login('ana@empresa.com', ' Clave-123\n')).resolves.toMatchObject({ accessToken: 'token' });
  });

  it('rechaza una contraseña distinta', async () => {
    await expect(service.login('ana@empresa.com', 'clave-123')).rejects.toThrow('Correo o contraseña incorrectos.');
    await expect(service.login('otra@empresa.com', 'Clave-123')).rejects.toThrow('Correo o contraseña incorrectos.');
  });
});
