import { IsIn, IsOptional, Matches } from 'class-validator';

export class MarkAttendanceDto {
  /**
   * Opcional: el tipo que el cliente cree estar marcando (lo que muestra el botón).
   * El servidor decide el tipo real; si no coincide se rechaza para evitar duplicados
   * (doble toque, dos pestañas abiertas, etc.).
   */
  @IsOptional()
  @IsIn(['IN', 'OUT'], { message: 'El tipo debe ser IN o OUT.' })
  expectedType?: 'IN' | 'OUT';
}

export class MonthQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'El mes debe tener el formato AAAA-MM.' })
  month?: string;
}
