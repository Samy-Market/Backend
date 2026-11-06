import { BadRequestException, Logger, ValidationError, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { CorsIoAdapter } from './realtime/socket-io.adapter';

export function corsOrigins(): string[] {
  return (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/** Aplana los errores de class-validator y traduce los mensajes por defecto que no se personalizaron. */
function flattenErrors(errors: ValidationError[], parent = ''): string[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = Object.entries(e.constraints ?? {}).map(([key, msg]) =>
      key === 'whitelistValidation' ? `El campo "${field}" no está permitido.` : msg,
    );
    return [...own, ...flattenErrors(e.children ?? [], field)];
  });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: corsOrigins(), credentials: true, exposedHeaders: ['Content-Disposition'] });
  app.useWebSocketAdapter(new CorsIoAdapter(app, corsOrigins()));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors: ValidationError[]) => new BadRequestException(flattenErrors(errors)),
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  const port = Number(process.env.PORT || 3000);
  // 0.0.0.0 para aceptar conexiones dentro del contenedor (Railway, Docker).
  await app.listen(port, '0.0.0.0');
  Logger.log(`API escuchando en http://localhost:${port}`, 'Bootstrap');
}
bootstrap();
