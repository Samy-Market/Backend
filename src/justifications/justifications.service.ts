import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JustificationStatus, Prisma, Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateJustificationDto, ListJustificationsQuery, ReviewJustificationDto } from './dto';

export const justificationInclude = {
  attendance: { select: { id: true, type: true, timestamp: true, isLate: true, lateMinutes: true } },
  employee: { select: { id: true, fullName: true, position: true } },
  reviewer: { select: { id: true, email: true } },
} satisfies Prisma.JustificationInclude;

export type JustificationWithRelations = Prisma.JustificationGetPayload<{ include: typeof justificationInclude }>;

@Injectable()
export class JustificationsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private realtime: RealtimeGateway,
  ) {}

  async create(user: AuthUser, dto: CreateJustificationDto): Promise<JustificationWithRelations> {
    if (!user.employeeId) throw new ForbiddenException('Solo los empleados pueden solicitar justificaciones.');
    const attendance = await this.prisma.attendance.findUnique({ where: { id: dto.attendanceId } });
    // Mismo mensaje si no existe o es de otra persona, para no filtrar información.
    if (!attendance || attendance.employeeId !== user.employeeId) {
      throw new NotFoundException('Marcación no encontrada.');
    }
    const pending = await this.prisma.justification.findFirst({
      where: { attendanceId: attendance.id, status: JustificationStatus.PENDING },
    });
    if (pending) throw new ConflictException('Ya existe una solicitud pendiente para esta marcación.');

    const created = await this.prisma.justification.create({
      data: { attendanceId: attendance.id, employeeId: user.employeeId, reason: dto.reason },
      include: justificationInclude,
    });
    this.realtime.emitJustificationCreated(created);
    return created;
  }

  /** Supervisores ven todas; un empleado solo las suyas. */
  findAll(user: AuthUser, query: ListJustificationsQuery) {
    const where: Prisma.JustificationWhereInput = {};
    if (query.status) where.status = query.status;
    if (user.role === Role.EMPLOYEE) where.employeeId = user.employeeId ?? '__none__';
    return this.prisma.justification.findMany({
      where,
      include: justificationInclude,
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });
  }

  async review(id: string, dto: ReviewJustificationDto, reviewer: AuthUser): Promise<JustificationWithRelations> {
    const before = await this.prisma.justification.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Justificación no encontrada.');
    if (before.status !== JustificationStatus.PENDING) {
      throw new BadRequestException('Esta justificación ya fue revisada.');
    }
    if (reviewer.employeeId && reviewer.employeeId === before.employeeId) {
      throw new ForbiddenException('No puedes revisar tu propia justificación.');
    }

    const reviewed = await this.prisma.$transaction(async (tx) => {
      // updateMany con condición de estado evita doble aprobación concurrente.
      const res = await tx.justification.updateMany({
        where: { id, status: JustificationStatus.PENDING },
        data: {
          status: dto.status,
          reviewNote: dto.reviewNote ?? null,
          reviewedBy: reviewer.sub,
          reviewedAt: new Date(),
        },
      });
      if (res.count === 0) throw new BadRequestException('Esta justificación ya fue revisada.');
      const after = await tx.justification.findUniqueOrThrow({ where: { id }, include: justificationInclude });
      await this.audit.log(
        {
          userId: reviewer.sub,
          action: dto.status === 'APPROVED' ? 'APPROVE' : 'REJECT',
          entity: 'Justification',
          entityId: id,
          before,
          after: { status: after.status, reviewNote: after.reviewNote, reviewedAt: after.reviewedAt },
        },
        tx,
      );
      return after;
    });
    this.realtime.emitJustificationReviewed(reviewed.employeeId, reviewed);
    return reviewed;
  }
}
