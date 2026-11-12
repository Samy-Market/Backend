import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { Role } from '../../../../shared/domain/roles';
import { Roles } from '../../../../shared/http/decorators';
import { DATE_REGEX } from '../../../../shared/http/validation';
import { AuditService } from '../../application/audit.service';

export class AuditQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  entity?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Usuario inválido.' })
  userId?: string;

  @IsOptional()
  @Matches(DATE_REGEX, { message: 'La fecha inicial debe tener el formato AAAA-MM-DD.' })
  from?: string;

  @IsOptional()
  @Matches(DATE_REGEX, { message: 'La fecha final debe tener el formato AAAA-MM-DD.' })
  to?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Página inválida.' })
  cursor?: string;
}

@Roles(Role.ADMIN)
@Controller('audit')
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  list(@Query() q: AuditQueryDto) {
    return this.audit.list(q);
  }

  @Get('filters')
  filters() {
    return this.audit.filters();
  }
}
