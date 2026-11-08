import { canSignIn } from './account';

describe('canSignIn', () => {
  it('cuenta activa sin ficha de empleado (personal)', () => {
    expect(canSignIn({ active: true, employee: null })).toBe(true);
  });
  it('cuenta desactivada', () => {
    expect(canSignIn({ active: false, employee: null })).toBe(false);
  });
  it('empleado con la ficha inactiva', () => {
    expect(canSignIn({ active: true, employee: { id: 'e', active: false } })).toBe(false);
  });
});
