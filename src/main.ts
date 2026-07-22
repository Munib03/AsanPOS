import * as dotenv from 'dotenv';
const environment = dotenv.config();
const AI_ENVIRONMENT_KEYS = [
  'OPENAI_API_KEY',
  'OPENCODE_BASE_URL',
  'OPENCODE_MODEL',
] as const;

for (const key of AI_ENVIRONMENT_KEYS) {
  const value = environment.parsed?.[key];
  if (value !== undefined) process.env[key] = value;
}

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
