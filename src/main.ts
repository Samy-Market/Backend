import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { corsOrigins } from './config/app.config';
import { AllExceptionsFilter } from './shared/http/filters/all-exceptions.filter';
import { validationPipe } from './shared/http/validation';
import { CorsIoAdapter } from './shared/infrastructure/realtime/socket-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: corsOrigins(), credentials: true, exposedHeaders: ['Content-Disposition'] });
  app.useWebSocketAdapter(new CorsIoAdapter(app, corsOrigins()));
  app.useGlobalPipes(validationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  const port = Number(process.env.PORT || 3000);
  // 0.0.0.0 para aceptar conexiones dentro del contenedor (Railway, Docker).
  await app.listen(port, '0.0.0.0');
  Logger.log(`API escuchando en http://localhost:${port}`, 'Bootstrap');
}
void bootstrap();
