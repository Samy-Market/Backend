import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { lowerEmail, trimString } from '../../../../shared/http/validation';

export class CreateEmployeeDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MaxLength(120, { message: 'El nombre no puede superar 120 caracteres.' })
  fullName: string;

  @Transform(lowerEmail)
  @IsEmail({}, { message: 'Ingresa un correo válido.' })
  email: string;

  @Transform(trimString)
  @Matches(/^\d{10}(\d{3})?$/, { message: 'La cédula debe tener 10 dígitos (o 13 si es RUC).' })
  documentId: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'El cargo es obligatorio.' })
  @MaxLength(80, { message: 'El cargo no puede superar 80 caracteres.' })
  position: string;

  /** Sede base del empleado (obligatoria). */
  @IsUUID('4', { message: 'Selecciona la sede del empleado.' })
  siteId: string;

  @IsOptional()
  @IsBoolean({ message: 'El estado activo debe ser verdadero o falso.' })
  active?: boolean;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  password: string;
}

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}

export class ListEmployeesQuery {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  q?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Sede inválida.' })
  siteId?: string;

  @IsOptional()
  @IsIn(['true', 'false', 'all'], { message: 'El filtro activo debe ser true, false o all.' })
  active?: 'true' | 'false' | 'all';
}
