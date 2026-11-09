/**
 * Reglas de los datos personales y de acceso, iguales en el servidor y en los formularios.
 */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 15;
export const EMAIL_MAX = 100;

const isProvince = (code: number) => (code >= 1 && code <= 24) || code === 30;

export function cedulaProblem(value: string): string | null {
  if (!/^\d+$/.test(value)) return 'La cédula solo puede tener números.';
  if (value.length !== 10) return 'La cédula debe tener exactamente 10 dígitos.';
  if (!isProvince(Number(value.slice(0, 2))))
    return 'La cédula no es válida: los dos primeros dígitos deben ser una provincia (01 a 24, o 30).';
  if (Number(value[2]) >= 6) return 'La cédula no es válida: el tercer dígito debe ser menor a 6.';
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(value[i]) * (i % 2 === 0 ? 2 : 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  const check = (10 - (sum % 10)) % 10;
  if (check !== Number(value[9])) return 'La cédula no es válida: revisa los dígitos (no coincide el dígito verificador).';
  return null;
}

export const isValidCedula = (value: string) => cedulaProblem(value) === null;
