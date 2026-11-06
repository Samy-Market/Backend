import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/**
 * Formato de error uniforme:
 * { statusCode, error, message, details?, timestamp, path }
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errores');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Ocurrió un error inesperado. Intenta nuevamente.';
    let details: string[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as string | { message?: string | string[] };
      const raw = typeof body === 'string' ? body : body.message;
      if (Array.isArray(raw)) {
        message = 'Los datos enviados no son válidos.';
        details = raw;
      } else if (raw) {
        message = raw;
      }
      if (status === HttpStatus.NOT_FOUND && message.startsWith('Cannot ')) {
        message = 'Recurso no encontrado.';
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        const labels: Record<string, string> = { documentId: 'cédula', email: 'correo', userId: 'usuario' };
        const fields = (exception.meta?.target as string[] | undefined)?.map((f) => labels[f] ?? f);
        message = fields?.length
          ? `Ya existe un registro con el mismo valor de ${fields.join(', ')}.`
          : 'Ya existe un registro con el mismo valor.';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'Registro no encontrado.';
      } else if (exception.code === 'P2003') {
        status = HttpStatus.BAD_REQUEST;
        message = 'Referencia inválida a otro registro.';
      }
    }

    if (status >= 500) this.logger.error(exception);

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
