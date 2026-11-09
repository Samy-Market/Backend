import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { lowerEmail, trimString, IsNewPassword, IsAppEmail } from '../../../../shared/http/validation';

export class SetupDto {
  @Transform(lowerEmail)
  @IsAppEmail()
  email: string;

  @IsNewPassword()
  password: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120, { message: 'El nombre de la sede no puede superar 120 caracteres.' })
  siteName?: string;

  @IsOptional()
  @IsString()
  code?: string;
}
