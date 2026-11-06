import { IsOptional, IsUUID, Matches } from 'class-validator';

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class ReportQueryDto {
  @Matches(DATE, { message: 'La fecha inicial debe tener el formato AAAA-MM-DD.' })
  from: string;

  @Matches(DATE, { message: 'La fecha final debe tener el formato AAAA-MM-DD.' })
  to: string;

  @IsOptional()
  @IsUUID('4', { message: 'Empleado inválido.' })
  employeeId?: string;
}
