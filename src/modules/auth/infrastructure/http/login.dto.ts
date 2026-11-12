import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { IsNewPassword, lowerEmail } from '../../../../shared/http/validation';

export class LoginDto {
  @Transform(lowerEmail)
  @IsEmail({}, { message: 'Ingresa un correo válido.' })
  email: string;

  @IsString({ message: 'La contraseña es obligatoria.' })
  @MinLength(1, { message: 'La contraseña es obligatoria.' })
  password: string;
}

export class ChangePasswordDto {
  @IsString({ message: 'Escribe tu contraseña actual.' })
  @MinLength(1, { message: 'Escribe tu contraseña actual.' })
  currentPassword: string;

  @IsNewPassword()
  newPassword: string;
}

export class ForgotPasswordDto {
  @Transform(lowerEmail)
  @IsEmail({}, { message: 'Ingresa un correo válido.' })
  email: string;
}

export class ResetTokenDto {
  @IsString({ message: 'Enlace inválido.' })
  @MaxLength(200, { message: 'Enlace inválido.' })
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Enlace inválido.' })
  token: string;
}

export class ResetPasswordDto extends ResetTokenDto {
  @IsNewPassword()
  newPassword: string;
}
