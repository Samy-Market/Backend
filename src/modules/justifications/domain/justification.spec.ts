import { BusinessRuleError, ForbiddenError } from '../../../shared/domain/errors';
import { assertCanReview } from './justification';

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
