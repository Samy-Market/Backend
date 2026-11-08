/** Bloque horario de un día (ej. "Mañana 08:00–18:00") con su tolerancia de atraso. */
export interface Shift {
  id: string;
  name: string;
  /** "HH:mm" en hora local */
  startTime: string;
  /** "HH:mm" en hora local */
  endTime: string;
  toleranceMinutes: number;
}

export type ShiftData = Omit<Shift, 'id'>;
