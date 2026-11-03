import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { SETTINGS } from './config';
import { setup } from './setup';
describe('API wiring and request validation', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SETTINGS)
      .useValue({
        port: 3000,
        jwtSecret: 'test-secret-with-at-least-32-characters',
        otpSecret: 'another-test-secret-with-at-least-32-characters',
        otpTransport: 'development',
        swaggerEnabled: true,
        corsOrigins: [],
      })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: jest.fn().mockResolvedValue([{ value: 1 }]),
        requestLimit: { upsert: jest.fn().mockResolvedValue({ count: 1 }) },
      })
      .compile();
    app = module.createNestApplication();
    setup(app);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it('serves prefixed readiness with security headers', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
  it('serves Swagger UI and complete request schemas', async () => {
    await request(app.getHttpServer()).get('/api/docs/').expect(200);
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const document = response.body;
    expect(
      document.components.schemas.VerifyOtpDto.properties.otp.example,
    ).toBe('123456');
    expect(
      document.components.schemas.VerifyOtpDto.properties.phone,
    ).toBeDefined();
    expect(
      document.components.schemas.AvailabilityDto.properties.days.items,
    ).toBeDefined();
    expect(
      document.components.schemas.PrescriptionDto.properties.medicines.items,
    ).toBeDefined();
    expect(document.paths['/api/appointments/book'].post.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/api/auth/send-otp'].post.security ?? []).toEqual(
      [],
    );
    expect(document.paths['/api/doctors/list'].get.security ?? []).toEqual([]);
  });
  it('requires bearer authentication on clinical routes', async () => {
    await request(app.getHttpServer())
      .post('/api/appointments/book')
      .send({})
      .expect(401);
  });
  it('rejects malformed phone numbers', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/send-otp')
      .send({ phone: 'not-a-phone' })
      .expect(400);
  });
  it('rejects the retired ADMIN registration role', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register-profile')
      .send({ registrationToken: 'a'.repeat(64), role: 'ADMIN' })
      .expect(400);
  });
  it('rejects unrecognized registration fields', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register-profile')
      .send({
        registrationToken: 'a'.repeat(64),
        role: 'PATIENT',
        isVerified: true,
      })
      .expect(400);
  });
});
