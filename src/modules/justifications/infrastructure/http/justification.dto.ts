import { JustificationStatus } from '../../domain/justification';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { trimString } from '../../../../shared/http/validation';

export class CreateJustificationDto {
  @ValidateIf((o: CreateJustificationDto) => o.date === undefined)
  @IsUUID('4', { message: 'Marcación inválida.' })
  attendanceId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha inválida (AAAA-MM-DD).' })
  date?: string;

  @Transform(trimString)
  @IsString()
  @MinLength(10, { message: 'Describe el motivo con al menos 10 caracteres.' })
  @MaxLength(1000, { message: 'El motivo no puede superar 1000 caracteres.' })
  reason: string;
}

export class ReviewJustificationDto {
  @IsIn(['APPROVED', 'REJECTED'], {
    message: 'El estado debe ser APPROVED o REJECTED.',
  })
  status: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'La nota no puede estar vacía.' })
  @MaxLength(500, { message: 'La nota no puede superar 500 caracteres.' })
  reviewNote?: string;
}

export class ListJustificationsQuery {
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED'], { message: 'Estado inválido.' })
  status?: JustificationStatus;
}
