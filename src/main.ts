import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SETTINGS, type Settings } from './config';
import { setup } from './setup';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  setup(app);
  await app.listen(app.get<Settings>(SETTINGS).port, '0.0.0.0');
}
void bootstrap();
