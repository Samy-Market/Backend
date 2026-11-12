export const DEFAULT_RADIUS_METERS = 150;
export const MIN_RADIUS_METERS = 30;
export const MAX_RADIUS_METERS = 2000;
export const MAX_ACCURACY_METERS = 500;
const ACCURACY_ALLOWANCE_METERS = 50;

export interface Geofence {
  lat: number;
  lng: number;
  radiusMeters: number;
}

export interface DeviceLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export function geofenceOf(site: { lat: number | null; lng: number | null; radiusMeters: number | null }): Geofence | null {
  if (site.lat === null || site.lng === null) return null;
  return { lat: site.lat, lng: site.lng, radiusMeters: site.radiusMeters ?? DEFAULT_RADIUS_METERS };
}

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type LocationCheck = { ok: true; distanceMeters: number | null } | { ok: false; message: string };

export function checkLocation(fence: Geofence | null, location: DeviceLocation | undefined, siteName: string): LocationCheck {
  if (!fence) return { ok: true, distanceMeters: null };
  if (!location) {
    return {
      ok: false,
      message: `Para marcar en ${siteName} necesitamos tu ubicación. Permite el acceso a la ubicación en el navegador e inténtalo de nuevo.`,
    };
  }
  if (location.accuracy > MAX_ACCURACY_METERS) {
    return {
      ok: false,
      message: `Tu ubicación es muy imprecisa (±${Math.round(location.accuracy)} m). Activa el GPS o acércate a una ventana e inténtalo de nuevo.`,
    };
  }
  const distance = distanceMeters(fence, { lat: location.latitude, lng: location.longitude });
  const effective = distance - Math.min(location.accuracy, ACCURACY_ALLOWANCE_METERS);
  if (effective > fence.radiusMeters) {
    return {
      ok: false,
      message: `Estás a ${formatDistance(distance)} de ${siteName}. Para marcar debes estar a menos de ${fence.radiusMeters} m.`,
    };
  }
  return { ok: true, distanceMeters: Math.round(distance) };
}

export function coordinatesProblem(lat: number | null, lng: number | null, radiusMeters: number | null): string | null {
  if ((lat === null) !== (lng === null)) return 'Indica la latitud y la longitud juntas, o deja ambas vacías.';
  if (lat === null) return radiusMeters === null ? null : 'Para usar un radio, primero indica la ubicación de la sede.';
  if (lat < -90 || lat > 90) return 'La latitud debe estar entre -90 y 90.';
  if (lng! < -180 || lng! > 180) return 'La longitud debe estar entre -180 y 180.';
  if (radiusMeters !== null && (radiusMeters < MIN_RADIUS_METERS || radiusMeters > MAX_RADIUS_METERS)) {
    return `El radio debe estar entre ${MIN_RADIUS_METERS} y ${MAX_RADIUS_METERS} metros.`;
  }
  return null;
}

function formatDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`;
}
