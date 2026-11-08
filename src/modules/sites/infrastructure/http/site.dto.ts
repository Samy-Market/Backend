import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
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
  /** CURRENT = vigentes y próximos (por defecto); ALL = incluye terminados. */
  @IsOptional()
  @IsIn(['CURRENT', 'ALL'], { message: 'El filtro debe ser CURRENT o ALL.' })
  scope?: 'CURRENT' | 'ALL';

  @IsOptional()
  @IsUUID('4', { message: 'Sede inválida.' })
  siteId?: string;
}
