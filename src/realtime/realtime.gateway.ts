import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Role } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../common/types';
import { EVENTS, ROOMS } from './events';

/**
 * Canal de notificaciones en vivo. Solo emite: las acciones se hacen por HTTP
 * y la base de datos es la fuente de verdad.
 */
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('Tiempo real');

  @WebSocketServer()
  server: Server;

  constructor(private auth: AuthService) {}

  /** Autentica el handshake con el mismo JWT de la API (auth.token o header Authorization). */
  afterInit(server: Server) {
    server.use(async (socket, next) => {
      const header = socket.handshake.headers.authorization;
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (header?.startsWith('Bearer ') ? header.slice(7) : undefined);
      if (!token) return next(new Error('No autenticado: falta el token.'));
      const user = await this.auth.verifyToken(token);
      if (!user) return next(new Error('No autenticado: token inválido o expirado.'));
      socket.data.user = user;
      next();
    });
  }

  async handleConnection(socket: Socket) {
    const user = socket.data.user as AuthUser;
    const rooms = [ROOMS.user(user.sub)];
    if (user.role === Role.ADMIN || user.role === Role.SUPERVISOR) rooms.push(ROOMS.admins);
    if (user.employeeId) rooms.push(ROOMS.employee(user.employeeId));
    await socket.join(rooms);
    socket.emit('session:ready', { rooms });
    this.logger.debug(`${user.email} conectado (${rooms.join(', ')})`);
  }

  handleDisconnect(socket: Socket) {
    const user = socket.data.user as AuthUser | undefined;
    if (user) this.logger.debug(`${user.email} desconectado`);
  }

  // --- Emisores usados por los servicios -----------------------------------

  emitAttendanceMarked(employeeId: string, payload: unknown) {
    this.server.to(ROOMS.admins).emit(EVENTS.attendanceMarked, payload);
    // También a los otros dispositivos del propio empleado (p. ej. celular y PC).
    this.server.to(ROOMS.employee(employeeId)).emit(EVENTS.attendanceMarked, payload);
  }

  emitJustificationCreated(payload: unknown) {
    this.server.to(ROOMS.admins).emit(EVENTS.justificationCreated, payload);
  }

  emitJustificationReviewed(employeeId: string, payload: unknown) {
    this.server.to(ROOMS.employee(employeeId)).emit(EVENTS.justificationReviewed, payload);
  }

  /** Cierra los sockets de un usuario (p. ej. al desactivarlo). */
  disconnectUser(userId: string) {
    this.server.in(ROOMS.user(userId)).disconnectSockets(true);
  }
}
