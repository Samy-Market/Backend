import { IsOptional, IsUUID, Matches } from 'class-validator';
import { DATE_REGEX } from '../../../../shared/http/validation';

export class ReportQueryDto {
  @Matches(DATE_REGEX, { message: 'La fecha inicial debe tener el formato AAAA-MM-DD.' })
  from: string;

  @Matches(DATE_REGEX, { message: 'La fecha final debe tener el formato AAAA-MM-DD.' })
  to: string;

  @IsOptional()
  @IsUUID('4', { message: 'Empleado inválido.' })
  employeeId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Sede inválida.' })
  siteId?: string;
}
