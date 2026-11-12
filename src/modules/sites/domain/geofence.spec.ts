import { checkLocation, coordinatesProblem, distanceMeters, geofenceOf } from './geofence';

const sede = { lat: -2.170998, lng: -79.922359, radiusMeters: 150 };
const at = (lat: number, lng: number, accuracy = 10) => ({ latitude: lat, longitude: lng, accuracy });

describe('Distancia', () => {
  it('calcula metros entre dos puntos', () => {
    expect(distanceMeters(sede, sede)).toBe(0);
    const d = distanceMeters(sede, { lat: -2.170998, lng: -79.921461 });
    expect(Math.round(d)).toBeGreaterThan(95);
    expect(Math.round(d)).toBeLessThan(105);
  });
});

describe('Marcar con ubicación', () => {
  it('una sede sin ubicación no exige nada', () => {
    expect(checkLocation(null, undefined, 'Matriz')).toEqual({ ok: true, distanceMeters: null });
    expect(geofenceOf({ lat: null, lng: null, radiusMeters: null })).toBeNull();
    expect(geofenceOf({ lat: 1, lng: 2, radiusMeters: null })).toEqual({ lat: 1, lng: 2, radiusMeters: 150 });
  });

  it('dentro del radio se permite y guarda la distancia', () => {
    const r = checkLocation(sede, at(-2.170998, -79.921461), 'Matriz');
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.distanceMeters).toBeGreaterThan(90);
  });

  it('lejos de la sede se rechaza indicando la distancia', () => {
    const r = checkLocation(sede, at(-2.18, -79.922359), 'Matriz');
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.message).toMatch(/Estás a 1,0 km de Matriz.*menos de 150 m/);
  });

  it('descuenta hasta 50 m de error del GPS', () => {
    const justOutside = at(-2.170998, -79.920651, 10);
    expect(checkLocation(sede, justOutside, 'Matriz').ok).toBe(false);
    expect(checkLocation(sede, { ...justOutside, accuracy: 40 }, 'Matriz').ok).toBe(true);
  });

  it('pide la ubicación si falta y rechaza una muy imprecisa', () => {
    const missing = checkLocation(sede, undefined, 'Matriz');
    expect(!missing.ok && missing.message).toMatch(/necesitamos tu ubicación/);
    const vague = checkLocation(sede, at(-2.170998, -79.922359, 900), 'Matriz');
    expect(!vague.ok && vague.message).toMatch(/muy imprecisa/);
  });
});

describe('Validar la ubicación de la sede', () => {
  it('exige latitud y longitud juntas y rangos válidos', () => {
    expect(coordinatesProblem(null, null, null)).toBeNull();
    expect(coordinatesProblem(-2.17, -79.92, 150)).toBeNull();
    expect(coordinatesProblem(-2.17, null, null)).toMatch('juntas');
    expect(coordinatesProblem(null, null, 100)).toMatch('primero indica');
    expect(coordinatesProblem(-2.17, -79.92, 10)).toMatch('entre 30 y 2000');
  });
});
