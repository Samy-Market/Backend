export const ROOMS = {
  admins: 'admins',
  employee: (employeeId: string) => `employee:${employeeId}`,
  user: (userId: string) => `user:${userId}`,
};

export const EVENTS = {
  attendanceMarked: 'attendance:marked',
  justificationCreated: 'justification:created',
  justificationReviewed: 'justification:reviewed',
} as const;
