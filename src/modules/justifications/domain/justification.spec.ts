import { BusinessRuleError, ForbiddenError } from '../../../shared/domain/errors';
import { absenceProblem, assertCanReview } from './justification';

describe('assertCanReview', () => {
  it('permite revisar una pendiente de otra persona', () => {
    expect(() => assertCanReview({ status: 'PENDING', employeeId: 'e1' }, null)).not.toThrow();
    expect(() => assertCanReview({ status: 'PENDING', employeeId: 'e1' }, 'e2')).not.toThrow();
  });

  it('no permite revisar dos veces', () => {
    expect(() => assertCanReview({ status: 'APPROVED', employeeId: 'e1' }, null)).toThrow(BusinessRuleError);
  });

  it('nadie revisa su propia justificación', () => {
    expect(() => assertCanReview({ status: 'PENDING', employeeId: 'e1' }, 'e1')).toThrow(ForbiddenError);
  });
});

describe('Justificar una ausencia', () => {
  const day = { date: '2026-11-05', today: '2026-11-12', planKind: 'WORK' as const, marks: 0 };
  it('se permite en un día de trabajo pasado sin marcas', () => {
    expect(absenceProblem(day)).toBeNull();
  });
  it('no se permite hoy, en el futuro, en descanso ni si hubo marcas', () => {
    expect(absenceProblem({ ...day, date: '2026-11-12' })).toMatch('ya pasaron');
    expect(absenceProblem({ ...day, date: '2026-11-20' })).toMatch('ya pasaron');
    expect(absenceProblem({ ...day, planKind: 'REST' })).toMatch('no tenías turno');
    expect(absenceProblem({ ...day, planKind: 'UNASSIGNED' })).toMatch('no tenías turno');
    expect(absenceProblem({ ...day, marks: 1 })).toMatch('justifica la marcación');
  });
});
