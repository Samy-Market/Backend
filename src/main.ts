import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { corsOrigins } from './config/app.config';
import { AllExceptionsFilter } from './shared/http/filters/all-exceptions.filter';
import { validationPipe } from './shared/http/validation';
import { CorsIoAdapter } from './shared/infrastructure/realtime/socket-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Railway pone un proxy delante: sin esto todas las peticiones llegarían con la IP del proxy
  // y el límite de intentos por IP bloquearía a todos a la vez.
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
  app.use(helmet());
  app.enableCors({ origin: corsOrigins(), credentials: true, exposedHeaders: ['Content-Disposition'] });
  app.useWebSocketAdapter(new CorsIoAdapter(app, corsOrigins()));
  app.useGlobalPipes(validationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  const port = Number(process.env.PORT || 3000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`API escuchando en http://localhost:${port}`, 'Bootstrap');
}
void bootstrap();
