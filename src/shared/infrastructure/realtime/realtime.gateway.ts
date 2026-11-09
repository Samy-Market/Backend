import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RealtimeNotifier } from '../../application/ports/realtime-notifier';
import { SessionVerifier } from '../../application/ports/session-verifier';
import { AuthUser } from '../../domain/auth-user';
import { isStaff } from '../../domain/roles';
import { EVENTS, ROOMS } from './events';

const data = (socket: Socket) => socket.data as { user?: AuthUser };

@WebSocketGateway()
export class RealtimeGateway extends RealtimeNotifier implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('Tiempo real');

  @WebSocketServer()
  server: Server;

  constructor(private sessions: SessionVerifier) {
    super();
  }

  afterInit(server: Server) {
    server.use((socket, next) => {
      this.authenticate(socket).then(
        () => next(),
        (error: Error) => next(error),
      );
    });
  }

  private async authenticate(socket: Socket) {
    const header = socket.handshake.headers.authorization;
    const token = (socket.handshake.auth?.token as string | undefined) ?? (header?.startsWith('Bearer ') ? header.slice(7) : undefined);
    if (!token) throw new Error('No autenticado: falta el token.');
    const user = await this.sessions.verify(token);
    if (!user) throw new Error('No autenticado: token inválido o expirado.');
    data(socket).user = user;
  }

  async handleConnection(socket: Socket) {
    const user = data(socket).user!;
    const rooms = [ROOMS.user(user.sub)];
    if (isStaff(user.role)) rooms.push(ROOMS.admins);
    if (user.employeeId) rooms.push(ROOMS.employee(user.employeeId));
    await socket.join(rooms);
    socket.emit('session:ready', { rooms });
    this.logger.debug(`${user.email} conectado (${rooms.join(', ')})`);
  }

  handleDisconnect(socket: Socket) {
    const { user } = data(socket);
    if (user) this.logger.debug(`${user.email} desconectado`);
  }

  attendanceMarked(employeeId: string, payload: unknown) {
    this.server.to(ROOMS.admins).emit(EVENTS.attendanceMarked, payload);
    this.server.to(ROOMS.employee(employeeId)).emit(EVENTS.attendanceMarked, payload);
  }

  justificationCreated(payload: unknown) {
    this.server.to(ROOMS.admins).emit(EVENTS.justificationCreated, payload);
  }

  justificationReviewed(employeeId: string, payload: unknown) {
    this.server.to(ROOMS.employee(employeeId)).emit(EVENTS.justificationReviewed, payload);
  }

  disconnectUser(userId: string) {
    this.server.in(ROOMS.user(userId)).disconnectSockets(true);
  }
}
