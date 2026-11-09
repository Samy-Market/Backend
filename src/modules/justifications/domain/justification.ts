import { BusinessRuleError, ForbiddenError } from '../../../shared/domain/errors';

export type JustificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ReviewDecision = Exclude<JustificationStatus, 'PENDING'>;

export const ALREADY_REVIEWED = 'Esta justificación ya fue revisada.';

export function assertCanReview(justification: { status: JustificationStatus; employeeId: string }, reviewerEmployeeId: string | null) {
  if (justification.status !== 'PENDING') throw new BusinessRuleError(ALREADY_REVIEWED);
  if (reviewerEmployeeId && reviewerEmployeeId === justification.employeeId) {
    throw new ForbiddenError('No puedes revisar tu propia justificación.');
  }
}
