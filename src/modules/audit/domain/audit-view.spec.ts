import { describeTarget, redact } from './audit-view';

describe('Vista de auditoría', () => {
  it('oculta contraseñas y tokens en cualquier nivel', () => {
    expect(redact({ email: 'a@x.com', passwordHash: 'abc', nested: { accessToken: 't', ok: 1 }, list: [{ password: 'x' }] })).toEqual({
      email: 'a@x.com',
      passwordHash: '••••',
      nested: { accessToken: '••••', ok: 1 },
      list: [{ password: '••••' }],
    });
  });

  it('describe el registro con su nombre, correo o empleado', () => {
    expect(describeTarget(null, { fullName: 'Ana Torres' })).toBe('Ana Torres');
    expect(describeTarget({ name: 'Sede Norte' }, null)).toBe('Sede Norte');
    expect(describeTarget(null, { employee: { fullName: 'Luis' } })).toBe('Luis');
    expect(describeTarget(null, { endDate: '2026-11-01' })).toBeNull();
  });
});
