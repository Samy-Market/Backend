import { overlappingTransfers, siteDeletionBlocker, siteForDay, TransferRule } from './site-rules';

const MATRIZ = 'matriz';
const NORTE = 'norte';
const emergencia: TransferRule = { id: 't1', siteId: NORTE, startDate: '2026-11-10', endDate: '2026-11-12' };
const soloHoy: TransferRule = { id: 't2', siteId: NORTE, startDate: '2026-11-20', endDate: '2026-11-20' };

describe('Sedes: dónde trabaja el empleado cada día', () => {
  it('sin traslados trabaja en su sede base', () => {
    expect(siteForDay(MATRIZ, [], '2026-11-09')).toEqual({ siteId: MATRIZ, transferId: null });
  });

  it('durante un traslado trabaja en la sede de destino (fechas inclusivas)', () => {
    expect(siteForDay(MATRIZ, [emergencia], '2026-11-10')).toEqual({ siteId: NORTE, transferId: 't1' });
    expect(siteForDay(MATRIZ, [emergencia], '2026-11-12')).toEqual({ siteId: NORTE, transferId: 't1' });
  });

  it('al terminar el traslado vuelve sola a su sede base', () => {
    expect(siteForDay(MATRIZ, [emergencia], '2026-11-13')).toEqual({ siteId: MATRIZ, transferId: null });
  });

  it('un traslado de un solo día (emergencia) solo afecta ese día', () => {
    expect(siteForDay(MATRIZ, [soloHoy], '2026-11-20').siteId).toBe(NORTE);
    expect(siteForDay(MATRIZ, [soloHoy], '2026-11-19').siteId).toBe(MATRIZ);
    expect(siteForDay(MATRIZ, [soloHoy], '2026-11-21').siteId).toBe(MATRIZ);
  });

  it('detecta traslados que se cruzan con uno nuevo', () => {
    expect(overlappingTransfers([emergencia, soloHoy], '2026-11-12', '2026-11-14').map((t) => t.id)).toEqual(['t1']);
    expect(overlappingTransfers([emergencia, soloHoy], '2026-11-13', '2026-11-19')).toHaveLength(0);
  });
});

describe('Eliminar sede', () => {
  it('no se elimina si es la sede base de empleados o tiene historial', () => {
    expect(siteDeletionBlocker({ employees: 0, attendances: 0, transfers: 0 })).toBeNull();
    expect(siteDeletionBlocker({ employees: 3, attendances: 0, transfers: 0 })).toContain('3 empleados');
    expect(siteDeletionBlocker({ employees: 0, attendances: 10, transfers: 0 })).toContain('desactívala');
    expect(siteDeletionBlocker({ employees: 0, attendances: 0, transfers: 1 })).toContain('desactívala');
  });
});
