import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email }, include: { employee: true } });
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !ok) throw new UnauthorizedException('Correo o contraseña incorrectos.');
    if (!user.active || (user.employee && !user.employee.active)) {
      throw new UnauthorizedException('Tu usuario está inactivo. Contacta a tu supervisor.');
    }
    const payload: AuthUser = {
      sub: user.id,
      email: user.email,
      role: user.role,
      employeeId: user.employee?.id ?? null,
    };
    return { accessToken: await this.jwt.signAsync(payload), user: await this.me(user.id) };
  }

  /** Devuelve el AuthUser si el usuario (y su ficha de empleado, si tiene) están activos. */
  async resolveActiveUser(userId: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { employee: true } });
    if (!user || !user.active || (user.employee && !user.employee.active)) return null;
    return { sub: user.id, email: user.email, role: user.role, employeeId: user.employee?.id ?? null };
  }

  /** Verifica un token (usado también por el gateway de WebSocket). */
  async verifyToken(token: string): Promise<AuthUser | null> {
    try {
      const payload = await this.jwt.verifyAsync<AuthUser>(token);
      return this.resolveActiveUser(payload.sub);
    } catch {
      return null;
    }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        active: true,
        employee: {
          select: {
            id: true,
            fullName: true,
            documentId: true,
            position: true,
            site: { select: { id: true, name: true } },
            shift: { select: { id: true, name: true, startTime: true, endTime: true, toleranceMinutes: true } },
          },
        },
      },
    });
    return user;
  }
}
