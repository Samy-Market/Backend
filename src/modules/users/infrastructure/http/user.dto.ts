import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { STAFF_ROLES, StaffRole } from '../../domain/staff-user';
import { lowerEmail } from '../../../../shared/http/validation';

export class CreateUserDto {
  @Transform(lowerEmail)
  @IsEmail({}, { message: 'Ingresa un correo válido.' })
  email: string;

  @IsIn(STAFF_ROLES, { message: 'El rol debe ser ADMIN o SUPERVISOR.' })
  role: StaffRole;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(100, { message: 'La contraseña no puede superar 100 caracteres.' })
  password: string;

  @IsOptional()
  @IsBoolean({ message: 'El estado activo debe ser verdadero o falso.' })
  active?: boolean;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}
