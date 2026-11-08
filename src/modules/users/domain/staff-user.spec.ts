import { BusinessRuleError } from '../../../shared/domain/errors';
import { assertSelfChangeAllowed, losesAdmin, StaffUser } from './staff-user';

const admin: StaffUser = { id: 'a', email: 'a@x.com', role: 'ADMIN', active: true, createdAt: new Date(), updatedAt: new Date() };

describe('reglas de usuarios del personal', () => {
  it('no permite desactivarse ni cambiarse el rol a sí mismo', () => {
    expect(() => assertSelfChangeAllowed(admin, { active: false }, true)).toThrow(BusinessRuleError);
    expect(() => assertSelfChangeAllowed(admin, { role: 'SUPERVISOR' }, true)).toThrow(BusinessRuleError);
    expect(() => assertSelfChangeAllowed(admin, { active: false }, false)).not.toThrow();
  });

  it('detecta cuando un administrador activo deja de serlo', () => {
    expect(losesAdmin(admin, { role: 'SUPERVISOR' })).toBe(true);
    expect(losesAdmin(admin, { active: false })).toBe(true);
    expect(losesAdmin(admin, { email: 'b@x.com' })).toBe(false);
    expect(losesAdmin({ ...admin, active: false }, { active: false })).toBe(false);
  });
});
