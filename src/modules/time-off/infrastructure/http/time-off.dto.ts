import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DATE_REGEX, trimString } from '../../../../shared/http/validation';
import { LEAVE_KINDS, LeaveKind } from '../../domain/time-off';

export class CreateHolidayDto {
  @Matches(DATE_REGEX, { message: 'La fecha debe tener el formato AAAA-MM-DD.' })
  date: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'El nombre del feriado es obligatorio.' })
  @MaxLength(80, { message: 'El nombre no puede superar 80 caracteres.' })
  name: string;
}

export class HolidaysQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Año inválido.' })
  @Min(2000, { message: 'Año inválido.' })
  @Max(2100, { message: 'Año inválido.' })
  year?: number;
}

export class CreateLeaveDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Elige al menos un empleado.' })
  @ArrayMaxSize(200, { message: 'Máximo 200 empleados a la vez.' })
  @ArrayUnique({ message: 'Hay empleados repetidos.' })
  @IsUUID('4', { each: true, message: 'Empleado inválido.' })
  employeeIds: string[];

  @IsIn(LEAVE_KINDS, { message: 'El tipo debe ser VACATION, MEDICAL o PERSONAL.' })
  kind: LeaveKind;

  @Matches(DATE_REGEX, { message: 'La fecha de inicio debe tener el formato AAAA-MM-DD.' })
  startDate: string;

  @Matches(DATE_REGEX, { message: 'La fecha de fin debe tener el formato AAAA-MM-DD.' })
  endDate: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(300, { message: 'La nota no puede superar 300 caracteres.' })
  note?: string;
}

export class LeavesQuery {
  @IsOptional()
  @IsIn(['CURRENT', 'ALL'], { message: 'El filtro debe ser CURRENT o ALL.' })
  scope?: 'CURRENT' | 'ALL';

  @IsOptional()
  @IsUUID('4', { message: 'Empleado inválido.' })
  employeeId?: string;
}
