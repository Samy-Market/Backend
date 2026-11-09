export abstract class RealtimeNotifier {
  abstract attendanceMarked(employeeId: string, payload: unknown): void;
  abstract justificationCreated(payload: unknown): void;
  abstract justificationReviewed(employeeId: string, payload: unknown): void;
  abstract disconnectUser(userId: string): void;
}
