import { IsEmail, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { lowerEmail } from '../../../../shared/http/validation';

export class LoginDto {
  @Transform(lowerEmail)
  @IsEmail({}, { message: 'Ingresa un correo válido.' })
  email: string;

  @IsString({ message: 'La contraseña es obligatoria.' })
  @MinLength(1, { message: 'La contraseña es obligatoria.' })
  password: string;
}
