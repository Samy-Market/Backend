import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { STAFF_ROLES, StaffRole } from '../../domain/staff-user';
import { lowerEmail, IsNewPassword, IsAppEmail } from '../../../../shared/http/validation';

export class CreateUserDto {
  @Transform(lowerEmail)
  @IsAppEmail()
  email: string;

  @IsIn(STAFF_ROLES, { message: 'El rol debe ser ADMIN o SUPERVISOR.' })
  role: StaffRole;

  @IsNewPassword()
  password: string;

  @IsOptional()
  @IsBoolean({ message: 'El estado activo debe ser verdadero o falso.' })
  active?: boolean;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}
