import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  Max,
  Min,
  ValidateIf,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { DATE_REGEX, trimString } from '../../../../shared/http/validation';

export class CreateSiteDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la sede es obligatorio.' })
  @MaxLength(80, { message: 'El nombre no puede superar 80 caracteres.' })
  name: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(200, { message: 'La dirección no puede superar 200 caracteres.' })
  address?: string | null;

  @IsOptional()
  @IsBoolean({ message: 'El estado activo debe ser verdadero o falso.' })
  active?: boolean;

  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsNumber({}, { message: 'La latitud debe ser un número.' })
  @Min(-90, { message: 'La latitud debe estar entre -90 y 90.' })
  @Max(90, { message: 'La latitud debe estar entre -90 y 90.' })
  lat?: number | null;

  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsNumber({}, { message: 'La longitud debe ser un número.' })
  @Min(-180, { message: 'La longitud debe estar entre -180 y 180.' })
  @Max(180, { message: 'La longitud debe estar entre -180 y 180.' })
  lng?: number | null;

  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsInt({ message: 'El radio debe ser un número entero de metros.' })
  @Min(30, { message: 'El radio debe estar entre 30 y 2000 metros.' })
  @Max(2000, { message: 'El radio debe estar entre 30 y 2000 metros.' })
  radiusMeters?: number | null;
}

export class UpdateSiteDto extends PartialType(CreateSiteDto) {}

export class CreateTransferDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Selecciona al menos un empleado.' })
  @ArrayMaxSize(200, { message: 'Máximo 200 empleados por traslado.' })
  @ArrayUnique({ message: 'Hay empleados repetidos.' })
  @IsUUID('4', { each: true, message: 'Empleado inválido.' })
  employeeIds: string[];

  @IsUUID('4', { message: 'Sede inválida.' })
  siteId: string;

  @Matches(DATE_REGEX, { message: 'La fecha de inicio debe tener el formato AAAA-MM-DD.' })
  startDate: string;

  @Matches(DATE_REGEX, { message: 'La fecha de fin debe tener el formato AAAA-MM-DD.' })
  endDate: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(300, { message: 'El motivo no puede superar 300 caracteres.' })
  reason?: string;
}

export class UpdateTransferDto {
  @Matches(DATE_REGEX, { message: 'La fecha de fin debe tener el formato AAAA-MM-DD.' })
  endDate: string;
}

export class ListTransfersQuery {
  @IsOptional()
  @IsIn(['CURRENT', 'ALL'], { message: 'El filtro debe ser CURRENT o ALL.' })
  scope?: 'CURRENT' | 'ALL';

  @IsOptional()
  @IsUUID('4', { message: 'Sede inválida.' })
  siteId?: string;
}
