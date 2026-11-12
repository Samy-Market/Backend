import { LoginThrottle } from './login-throttle';

const MIN = 60_000;
const rules = { maxPerEmail: 3, maxPerIp: 5, windowMinutes: 15, lockMinutes: 15 };

describe('Límite de intentos de inicio de sesión', () => {
  it('bloquea el correo al llegar al máximo de fallos y lo libera al terminar el bloqueo', () => {
    const t = new LoginThrottle(rules);
    expect(t.fail('ana@x.com', '1.1.1.1', 0)).toBe(2);
    expect(t.fail('ana@x.com', '1.1.1.1', MIN)).toBe(1);
    expect(t.fail('ana@x.com', '1.1.1.1', 2 * MIN)).toBe(0);
    expect(t.check('ANA@x.com ', '9.9.9.9', 3 * MIN)).toEqual({ allowed: false, retryInMinutes: 14 });
    expect(t.check('ana@x.com', '1.1.1.1', 17 * MIN)).toEqual({ allowed: true });
  });

  it('olvida los fallos que salen de la ventana de tiempo', () => {
    const t = new LoginThrottle(rules);
    t.fail('ana@x.com', '1.1.1.1', 0);
    t.fail('ana@x.com', '1.1.1.1', MIN);
    expect(t.fail('ana@x.com', '1.1.1.1', 20 * MIN)).toBe(2);
    expect(t.check('ana@x.com', '1.1.1.1', 20 * MIN).allowed).toBe(true);
  });

  it('un acceso correcto reinicia la cuenta del correo', () => {
    const t = new LoginThrottle(rules);
    t.fail('ana@x.com', '1.1.1.1', 0);
    t.fail('ana@x.com', '1.1.1.1', 0);
    t.succeed('ana@x.com');
    expect(t.fail('ana@x.com', '1.1.1.1', 0)).toBe(2);
  });

  it('bloquea la IP que prueba muchos correos distintos sin afectar a otras IP', () => {
    const t = new LoginThrottle(rules);
    for (let i = 0; i < 5; i++) t.fail(`u${i}@x.com`, '6.6.6.6', 0);
    expect(t.check('nuevo@x.com', '6.6.6.6', MIN).allowed).toBe(false);
    expect(t.check('nuevo@x.com', '7.7.7.7', MIN).allowed).toBe(true);
  });
});
