import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, Matches, Max, Min, ValidateNested } from 'class-validator';

export class DeviceLocationDto {
  @IsNumber({}, { message: 'Ubicación inválida.' })
  @Min(-90, { message: 'Ubicación inválida.' })
  @Max(90, { message: 'Ubicación inválida.' })
  latitude: number;

  @IsNumber({}, { message: 'Ubicación inválida.' })
  @Min(-180, { message: 'Ubicación inválida.' })
  @Max(180, { message: 'Ubicación inválida.' })
  longitude: number;

  @IsNumber({}, { message: 'Ubicación inválida.' })
  @Min(0, { message: 'Ubicación inválida.' })
  accuracy: number;
}

export class MarkAttendanceDto {
  @IsOptional()
  @IsIn(['IN', 'OUT'], { message: 'El tipo debe ser IN o OUT.' })
  expectedType?: 'IN' | 'OUT';

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceLocationDto)
  location?: DeviceLocationDto;
}

export class MonthQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'El mes debe tener el formato AAAA-MM.' })
  month?: string;
}
