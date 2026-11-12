import { cancelLeaveAction, dayOffFor, overlappingLeaves } from './time-off';

const t = {
  holidays: new Map([['2026-11-02', 'Día de Difuntos']]),
  leaves: [{ id: 'l1', kind: 'VACATION' as const, startDate: '2026-11-01', endDate: '2026-11-05' }],
};

describe('Días libres', () => {
  it('un feriado tiene prioridad sobre las vacaciones', () => {
    expect(dayOffFor('2026-11-02', t)).toEqual({ kind: 'HOLIDAY', label: 'Feriado: Día de Difuntos' });
    expect(dayOffFor('2026-11-03', t)).toEqual({ kind: 'LEAVE', leaveKind: 'VACATION', label: 'Vacaciones' });
    expect(dayOffFor('2026-11-06', t)).toBeNull();
  });

  it('detecta permisos que se cruzan', () => {
    expect(overlappingLeaves(t.leaves, '2026-11-05', '2026-11-10')).toHaveLength(1);
    expect(overlappingLeaves(t.leaves, '2026-11-06', '2026-11-10')).toHaveLength(0);
  });

  it('cancelar: borra lo futuro, termina lo que está en curso y no toca lo pasado', () => {
    const today = '2026-11-03';
    expect(cancelLeaveAction({ startDate: '2026-11-03', endDate: '2026-11-09' }, today, '2026-11-02')).toEqual({ kind: 'delete' });
    expect(cancelLeaveAction({ startDate: '2026-11-01', endDate: '2026-11-09' }, today, '2026-11-02')).toEqual({
      kind: 'end',
      endDate: '2026-11-02',
    });
    expect(cancelLeaveAction({ startDate: '2026-10-01', endDate: '2026-10-09' }, today, '2026-11-02').kind).toBe('none');
  });
});
