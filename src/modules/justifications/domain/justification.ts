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

export function absenceProblem(day: {
  date: string;
  today: string;
  planKind: 'WORK' | 'REST' | 'UNASSIGNED';
  marks: number;
}): string | null {
  if (day.date >= day.today) return 'Solo se pueden justificar ausencias de días que ya pasaron.';
  if (day.planKind !== 'WORK') return 'Ese día no tenías turno de trabajo.';
  if (day.marks > 0) return 'Ese día sí tiene marcaciones: justifica la marcación.';
  return null;
}
