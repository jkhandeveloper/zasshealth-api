import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { sign } from 'jsonwebtoken';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppModule } from '../src/app.module';
import { setup } from '../src/setup';
import { SETTINGS } from '../src/config';
import { AuthService } from '../src/auth/auth.service';

describe('PostgreSQL healthcare integration', () => {
  let app: INestApplication;
  let db: PrismaService;
  const secret = randomBytes(32).toString('hex');
  const userIds: string[] = [];
  const phones: string[] = [];
  let doctorId: string;
  let doctorUserId: string;
  let superAdminId: string;
  let pharmacistId: string;
  let otherPharmacistId: string;
  const patients: string[] = [];
  const slot = new Date(Date.now() + 7 * 86400000);
  slot.setUTCHours(9, 0, 0, 0);
  const token = (id: string) =>
    sign({}, secret, {
      subject: id,
      issuer: 'zasshealth',
      audience: 'zasshealth-api',
      expiresIn: '5m',
    });
  const phone = () => {
    const value =
      '+1555' +
      randomBytes(5).readUIntBE(0, 5).toString().slice(0, 10).padStart(10, '0');
    phones.push(value);
    return value;
  };
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL)
      throw new Error(
        'Set TEST_DATABASE_URL to an isolated PostgreSQL database with migrations applied',
      );
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SETTINGS)
      .useValue({
        port: 3000,
        production: false,
        otpTransport: 'development',
        fixedOtp: '123456',
        jwtSecret: secret,
        otpSecret: secret,
        corsOrigins: [],
      })
      .compile();
    app = module.createNestApplication();
    setup(app);
    await app.init();
    db = app.get(PrismaService);
    const doctor = await db.user.create({
      data: {
        phone: phone(),
        role: 'DOCTOR',
        isVerified: true,
        doctorProfile: {
          create: {
            specialty: 'General',
            fees: 50,
            slotDuration: 30,
            maxPatientsPerSlot: 2,
            isApproved: true,
            availability: {
              create: {
                dayOfWeek: slot.getUTCDay(),
                startTime: '09:00',
                endTime: '11:00',
                isOpen: true,
              },
            },
          },
        },
      },
      include: { doctorProfile: true },
    });
    userIds.push(doctor.id);
    doctorUserId = doctor.id;
    doctorId = doctor.doctorProfile!.id;
    const superAdmin = await db.user.create({
      data: { phone: phone(), role: 'SUPER_ADMIN', isVerified: true },
    });
    superAdminId = superAdmin.id;
    userIds.push(superAdmin.id);
    for (let i = 0; i < 8; i++) {
      const patient = await db.user.create({
        data: {
          phone: phone(),
          role: 'PATIENT',
          isVerified: true,
          patientProfile: { create: {} },
        },
      });
      userIds.push(patient.id);
      patients.push(patient.id);
    }
    for (let i = 0; i < 2; i++) {
      const pharmacist = await db.user.create({
        data: {
          phone: phone(),
          role: 'PHARMACIST',
          isVerified: true,
          pharmacistProfile: { create: { pharmacyName: 'Test' } },
        },
      });
      userIds.push(pharmacist.id);
      if (i === 0) pharmacistId = pharmacist.id;
      else otherPharmacistId = pharmacist.id;
    }
  });
  afterAll(async () => {
    if (db) {
      await db.prescription.deleteMany({
        where: { doctor: { userId: { in: userIds } } },
      });
      await db.bill.deleteMany({
        where: { pharmacist: { userId: { in: userIds } } },
      });
      await db.appointment.deleteMany({ where: { doctorId } });
      await db.availability.deleteMany({ where: { doctorId } });
      await db.doctorProfile.deleteMany({ where: { userId: { in: userIds } } });
      await db.patientProfile.deleteMany({
        where: { userId: { in: userIds } },
      });
      await db.pharmacistProfile.deleteMany({
        where: { userId: { in: userIds } },
      });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      await db.otpChallenge.deleteMany({ where: { phone: { in: phones } } });
    }
    if (app) await app.close();
  });
  it('rejects anonymous and wrong-role bookings', async () => {
    await request(app.getHttpServer())
      .post('/api/appointments/book')
      .send({ doctorId, slotTime: slot.toISOString() })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/appointments/book')
      .auth(token(doctorUserId), { type: 'bearer' })
      .send({ doctorId, slotTime: slot.toISOString() })
      .expect(403);
  });
  it('enforces capacity under simultaneous requests and releases cancelled capacity', async () => {
    const results = await Promise.all(
      patients.map((id) =>
        request(app.getHttpServer())
          .post('/api/appointments/book')
          .auth(token(id), { type: 'bearer' })
          .send({ doctorId, slotTime: slot.toISOString() }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 409)).toHaveLength(6);
    expect(
      await db.appointment.count({
        where: { doctorId, status: 'CONFIRMED', slotTime: slot },
      }),
    ).toBe(2);
    const winner = results.findIndex((r) => r.status === 201);
    const loser = results.findIndex((r) => r.status === 409);
    await request(app.getHttpServer())
      .post('/api/appointments/cancel')
      .auth(token(patients[loser]), { type: 'bearer' })
      .send({ appointmentId: results[winner].body.id })
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/appointments/cancel')
      .auth(token(patients[winner]), { type: 'bearer' })
      .send({ appointmentId: results[winner].body.id })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/appointments/book')
      .auth(token(patients[loser]), { type: 'bearer' })
      .send({ doctorId, slotTime: slot.toISOString() })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/doctors/set-availability')
      .auth(token(doctorUserId), { type: 'bearer' })
      .send({
        days: [
          {
            dayOfWeek: slot.getUTCDay(),
            startTime: '10:00',
            endTime: '11:00',
            isOpen: true,
          },
        ],
      })
      .expect(409);
  });
  it('rejects duplicate booking and off-grid timestamps', async () => {
    const next = new Date(slot.getTime() + 30 * 60000).toISOString();
    await request(app.getHttpServer())
      .post('/api/appointments/book')
      .auth(token(patients[0]), { type: 'bearer' })
      .send({ doctorId, slotTime: next })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/appointments/book')
      .auth(token(patients[0]), { type: 'bearer' })
      .send({ doctorId, slotTime: next })
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/appointments/book')
      .auth(token(patients[0]), { type: 'bearer' })
      .send({
        doctorId,
        slotTime: new Date(slot.getTime() + 60000).toISOString(),
      })
      .expect(400);
  });
  it('scopes bills to their pharmacist and enforces transitions', async () => {
    const bill = await request(app.getHttpServer())
      .post('/api/pharmacist/bills')
      .auth(token(pharmacistId), { type: 'bearer' })
      .send({ patientName: 'Test', totalAmount: 12.34, paymentMethod: 'CASH' })
      .expect(201);
    await request(app.getHttpServer())
      .patch('/api/pharmacist/bills/' + bill.body.id + '/payment')
      .auth(token(otherPharmacistId), { type: 'bearer' })
      .send({ paymentStatus: 'PAID' })
      .expect(404);
    await request(app.getHttpServer())
      .patch('/api/pharmacist/bills/' + bill.body.id + '/delivery')
      .auth(token(pharmacistId), { type: 'bearer' })
      .send({ deliveryStatus: 'DELIVERED' })
      .expect(409);
    await request(app.getHttpServer())
      .patch('/api/pharmacist/bills/' + bill.body.id + '/payment')
      .auth(token(pharmacistId), { type: 'bearer' })
      .send({ paymentStatus: 'PAID' })
      .expect(200);
  });
  it('allows only SUPER_ADMIN to change doctor approval', async () => {
    await request(app.getHttpServer())
      .patch('/api/doctors/' + doctorId + '/approval')
      .auth(token(patients[0]), { type: 'bearer' })
      .send({ isApproved: true })
      .expect(403);
    await request(app.getHttpServer())
      .patch('/api/doctors/' + doctorId + '/approval')
      .auth(token(superAdminId), { type: 'bearer' })
      .send({ isApproved: true })
      .expect(200);
  });
  it('requires a past confirmed consultation and scopes prescriptions to their owners', async () => {
    const patient = await db.patientProfile.findUniqueOrThrow({
      where: { userId: patients[0] },
    });
    const other = await db.user.create({
      data: {
        phone: phone(),
        role: 'DOCTOR',
        isVerified: true,
        doctorProfile: {
          create: { specialty: 'Other', fees: 50, isApproved: true },
        },
      },
    });
    userIds.push(other.id);
    const body = {
      patientId: patient.id,
      medicines: [
        {
          name: 'Synthetic medicine',
          dosage: 'Test',
          frequency: 'Test',
          duration: 'Test',
        },
      ],
    };
    const prescribe = (id: string) =>
      request(app.getHttpServer())
        .post('/api/prescriptions')
        .auth(token(id), { type: 'bearer' })
        .send(body);
    // The earlier bookings are future appointments and must not authorize prescribing.
    await prescribe(doctorUserId).expect(403);
    await prescribe(patients[0]).expect(403);
    const consultation = await db.appointment.create({
      data: {
        doctorId,
        patientId: patient.id,
        slotTime: new Date(Date.now() - 86400000),
        status: 'CANCELLED',
      },
    });
    await prescribe(doctorUserId).expect(403);
    await db.appointment.update({
      where: { id: consultation.id },
      data: { status: 'CONFIRMED' },
    });
    await prescribe(other.id).expect(403);
    const created = await prescribe(doctorUserId).expect(201);
    for (const [id, visible] of [
      [patients[0], true],
      [doctorUserId, true],
      [patients[1], false],
      [other.id, false],
    ] as const) {
      const listed = await request(app.getHttpServer())
        .get('/api/prescriptions')
        .auth(token(id), { type: 'bearer' })
        .expect(200);
      expect(
        listed.body.some((p: { id: string }) => p.id === created.body.id),
      ).toBe(visible);
    }
  });
  it('waits for an in-flight approval revocation and rejects the prescription', async () => {
    const patient = await db.patientProfile.findUniqueOrThrow({
      where: { userId: patients[0] },
    });
    const before = await db.prescription.count({ where: { doctorId } });
    const lockDoctor = db.lockDoctor.bind(db);
    let signalAttempt!: () => void;
    const attempted = new Promise<void>((resolve) => {
      signalAttempt = resolve;
    });
    const spy = jest
      .spyOn(db, 'lockDoctor')
      .mockImplementation(async (tx, id) => {
        if (id === doctorId) signalAttempt();
        return lockDoctor(tx, id);
      });
    let pending: Promise<request.Response> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await db.$transaction(
        async (tx) => {
          await lockDoctor(tx, doctorId);
          await tx.doctorProfile.update({
            where: { id: doctorId },
            data: { isApproved: false },
          });
          pending = request(app.getHttpServer())
            .post('/api/prescriptions')
            .auth(token(doctorUserId), { type: 'bearer' })
            .send({
              patientId: patient.id,
              medicines: [
                {
                  name: 'Test',
                  dosage: 'Test',
                  frequency: 'Test',
                  duration: 'Test',
                },
              ],
            })
            .then((response) => response);
          // Commit only after the HTTP request reaches the shared lock, without sleeps.
          await Promise.race([
            attempted,
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () =>
                  reject(new Error('Prescription did not acquire doctor lock')),
                5000,
              );
            }),
          ]);
        },
        { timeout: 10000 },
      );
      expect((await pending!).status).toBe(403);
      expect(await db.prescription.count({ where: { doctorId } })).toBe(before);
    } finally {
      if (timer) clearTimeout(timer);
      spy.mockRestore();
      if (pending) await pending;
      await db.$transaction(async (tx) => {
        await lockDoctor(tx, doctorId);
        await tx.doctorProfile.update({
          where: { id: doctorId },
          data: { isApproved: true },
        });
      });
    }
  });
  it('commits OTP failure counts, prevents replay and blocks admin escalation', async () => {
    const auth = app.get(AuthService);
    const number = phone();
    const sent = await auth.sendOtp({ phone: number });
    const wrong = sent.developmentOtp === '000000' ? '000001' : '000000';
    await expect(
      auth.verifyOtp({ phone: number, otp: wrong }),
    ).rejects.toThrow();
    expect(
      (await db.otpChallenge.findUniqueOrThrow({ where: { phone: number } }))
        .attempts,
    ).toBe(1);
    const verified = await auth.verifyOtp({
      phone: number,
      otp: sent.developmentOtp!,
    });
    await expect(
      auth.verifyOtp({ phone: number, otp: sent.developmentOtp! }),
    ).rejects.toThrow();
    if (!('registrationToken' in verified))
      throw new Error('Expected registration token');
    await expect(
      auth.register({
        role: 'SUPER_ADMIN',
        registrationToken: verified.registrationToken!,
      }),
    ).rejects.toThrow();
    const registered = await auth.register({
      role: 'PATIENT',
      registrationToken: verified.registrationToken!,
    });
    userIds.push(registered.user.id);
    await expect(
      auth.register({
        role: 'PATIENT',
        registrationToken: verified.registrationToken!,
      }),
    ).rejects.toThrow();
  });
});
