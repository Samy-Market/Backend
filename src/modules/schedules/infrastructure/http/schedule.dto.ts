import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DATE_REGEX, trimString } from '../../../../shared/http/validation';

export class ScheduleDayDto {
  @IsInt({ message: 'El día de la semana debe ser un número del 1 (lunes) al 7 (domingo).' })
  @Min(1, { message: 'El día de la semana debe ser un número del 1 (lunes) al 7 (domingo).' })
  @Max(7, { message: 'El día de la semana debe ser un número del 1 (lunes) al 7 (domingo).' })
  weekday: number;

  @ValidateIf((_o, v) => v !== null)
  @IsUUID('4', { message: 'Turno inválido.' })
  shiftId: string | null;
}

export class CreateScheduleDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'El nombre del horario es obligatorio.' })
  @MaxLength(80, { message: 'El nombre no puede superar 80 caracteres.' })
  name: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(300, { message: 'La descripción no puede superar 300 caracteres.' })
  description?: string | null;

  @IsArray()
  @ArrayMinSize(7, { message: 'Define los 7 días de la semana (turno o descanso).' })
  @ArrayMaxSize(7, { message: 'Define los 7 días de la semana (turno o descanso).' })
  @ValidateNested({ each: true })
  @Type(() => ScheduleDayDto)
  days: ScheduleDayDto[];

  @IsOptional()
  @IsBoolean({ message: 'El estado activo debe ser verdadero o falso.' })
  active?: boolean;
}

export class UpdateScheduleDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'El nombre del horario es obligatorio.' })
  @MaxLength(80, { message: 'El nombre no puede superar 80 caracteres.' })
  name?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(300, { message: 'La descripción no puede superar 300 caracteres.' })
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(7, { message: 'Define los 7 días de la semana (turno o descanso).' })
  @ArrayMaxSize(7, { message: 'Define los 7 días de la semana (turno o descanso).' })
  @ValidateNested({ each: true })
  @Type(() => ScheduleDayDto)
  days?: ScheduleDayDto[];

  @IsOptional()
  @IsBoolean({ message: 'El estado activo debe ser verdadero o falso.' })
  active?: boolean;
}

export class AssignScheduleDto {
  @IsUUID('4', { message: 'Horario inválido.' })
  scheduleId: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Selecciona al menos un empleado.' })
  @ArrayMaxSize(500, { message: 'Máximo 500 empleados por asignación.' })
  @ArrayUnique({ message: 'Hay empleados repetidos.' })
  @IsUUID('4', { each: true, message: 'Empleado inválido.' })
  employeeIds: string[];

  @Matches(DATE_REGEX, { message: 'La fecha de inicio debe tener el formato AAAA-MM-DD.' })
  startDate: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Matches(DATE_REGEX, { message: 'La fecha de fin debe tener el formato AAAA-MM-DD.' })
  endDate?: string | null;
}

export class UpdateAssignmentDto {
  @ValidateIf((_o, v) => v !== null)
  @Matches(DATE_REGEX, { message: 'La fecha de fin debe tener el formato AAAA-MM-DD.' })
  endDate: string | null;
}

export class RangeQueryDto {
  @IsOptional()
  @Matches(DATE_REGEX, { message: 'La fecha inicial debe tener el formato AAAA-MM-DD.' })
  from?: string;

  @IsOptional()
  @Matches(DATE_REGEX, { message: 'La fecha final debe tener el formato AAAA-MM-DD.' })
  to?: string;
}

export class UnassignDto {
  @IsArray({ message: 'Indica las asignaciones a quitar.' })
  @ArrayMinSize(1, { message: 'Selecciona al menos un empleado.' })
  @ArrayMaxSize(500, { message: 'No se pueden quitar más de 500 a la vez.' })
  @ArrayUnique({ message: 'Hay asignaciones repetidas.' })
  @IsUUID('4', { each: true, message: 'Asignación inválida.' })
  ids: string[];
}
