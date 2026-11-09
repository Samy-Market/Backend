export interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  toleranceMinutes: number;
}

export type ShiftData = Omit<Shift, 'id'>;
