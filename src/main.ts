import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // ✅ 启用跨域：允许所有来源、所有请求头
  app.enableCors({
    origin: '*', // 允许任意来源
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.use('/images', express.static(join(__dirname, '..', 'public', 'images')));
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
