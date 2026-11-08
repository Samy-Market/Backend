import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { lowerEmail, trimString } from '../../../../shared/http/validation';

export class SetupDto {
  @Transform(lowerEmail)
  @IsEmail({}, { message: 'Ingresa un correo válido.' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(100, { message: 'La contraseña no puede superar 100 caracteres.' })
  password: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120, { message: 'El nombre de la sede no puede superar 120 caracteres.' })
  siteName?: string;

  /** Solo si el servidor define SETUP_CODE. */
  @IsOptional()
  @IsString()
  code?: string;
}
