import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import {
  BusinessRuleError,
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../../domain/errors';

const STATUS_BY_ERROR: [new (...a: never[]) => DomainError, HttpStatus][] = [
  [NotFoundError, HttpStatus.NOT_FOUND],
  [BusinessRuleError, HttpStatus.BAD_REQUEST],
  [ConflictError, HttpStatus.CONFLICT],
  [ForbiddenError, HttpStatus.FORBIDDEN],
  [UnauthorizedError, HttpStatus.UNAUTHORIZED],
  [TooManyRequestsError, HttpStatus.TOO_MANY_REQUESTS],
];

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errores');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Ocurrió un error inesperado. Intenta nuevamente.';
    let details: string[] | undefined;

    if (exception instanceof DomainError) {
      status = STATUS_BY_ERROR.find(([type]) => exception instanceof type)?.[1] ?? HttpStatus.BAD_REQUEST;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as string | { message?: string | string[] };
      const raw = typeof body === 'string' ? body : body.message;
      if (Array.isArray(raw)) {
        message = 'Los datos enviados no son válidos.';
        details = raw;
      } else if (raw) {
        message = raw;
      }
      if (status === HttpStatus.NOT_FOUND && message.startsWith('Cannot ')) message = 'Recurso no encontrado.';
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) this.logger.error(exception);

    res.status(status).json({
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      message,
      ...(details ? { details } : {}),
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }
}
