import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { logger } from './common/json-logger';
import { requestLogging } from './common/request-logging.middleware';
import { config } from './config';
import { createPool } from './db/db.service';
import { runMigrations } from './db/migrate';
import { seedDemoData } from './db/seed';

async function prepareDatabase(): Promise<void> {
  const pool = createPool();
  try {
    await runMigrations(pool);
    if (config().seedDemo) await seedDemoData(pool);
  } finally {
    await pool.end();
  }
}

async function bootstrap(): Promise<void> {
  const cfg = config();
  await prepareDatabase();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger, bodyParser: false });
  // Chỉ tin X-Forwarded-For từ Nginx trong mạng nội bộ Docker để lấy đúng IP khách khi giới hạn tốc độ.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.disable('x-powered-by');
  app.use(requestLogging);
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '100kb' });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  const doc = new DocumentBuilder()
    .setTitle('Hệ thống đặt lịch hẹn – API')
    .setDescription(
      'Hợp đồng dữ liệu giữa frontend và backend. Lỗi trả về dạng { error: { code, message, request_id } }. ' +
        'Thời gian trao đổi theo ISO 8601; ngày/giờ đặt lịch theo giờ Việt Nam (Asia/Ho_Chi_Minh).',
    )
    .setVersion('1.0')
    .addCookieAuth('hen_session')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc), {
    jsonDocumentUrl: 'api/docs/openapi.json',
  });

  await app.get(AuthService).bootstrapAdmin();
  await app.listen(cfg.port, '0.0.0.0');
  logger.info('backend_started', { port: cfg.port });
}

bootstrap().catch((err) => {
  logger.error('backend_start_failed', { error: (err as Error).message, stack: (err as Error).stack });
  process.exit(1);
});
