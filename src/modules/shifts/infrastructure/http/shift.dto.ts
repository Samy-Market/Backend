import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { HHMM_REGEX, trimString } from '../../../../shared/http/validation';

export class CreateShiftDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'El nombre del turno es obligatorio.' })
  @MaxLength(60, { message: 'El nombre no puede superar 60 caracteres.' })
  name: string;

  @Matches(HHMM_REGEX, { message: 'La hora de entrada debe tener el formato HH:mm.' })
  startTime: string;

  @Matches(HHMM_REGEX, { message: 'La hora de salida debe tener el formato HH:mm.' })
  endTime: string;

  @IsInt({ message: 'La tolerancia debe ser un número entero de minutos.' })
  @Min(0, { message: 'La tolerancia no puede ser negativa.' })
  @Max(240, { message: 'La tolerancia no puede superar 240 minutos.' })
  toleranceMinutes: number;
}

export class UpdateShiftDto extends PartialType(CreateShiftDto) {}
