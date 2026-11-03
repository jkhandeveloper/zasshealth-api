import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { PrismaFilter } from './common/prisma.filter';
import { SETTINGS, type Settings } from './config';
export function setup(app: INestApplication) {
  const config = app.get<Settings>(SETTINGS);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.enableCors({ origin: config.corsOrigins, credentials: false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new PrismaFilter());
  if (config.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('ZassHealth API')
        .setDescription(
          'Send OTP, then verify with 123456 in development. Existing seeded users receive accessToken; paste it into Authorize. New phones require register-profile. Schedules are UTC. Seed accounts are listed in README.md.',
        )
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: '/api/docs-json',
      swaggerOptions: { persistAuthorization: false },
    });
  }
  app.enableShutdownHooks();
}
