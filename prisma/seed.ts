import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';

async function main() {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.SEED_DEMO_DATA !== 'true'
  )
    throw new Error(
      'Demo seed requires SEED_DEMO_DATA=true and a non-production environment',
    );
  const db = new PrismaClient();
  const accounts = [
    {
      id: '10000000-0000-4000-8000-000000000001',
      phone: '+923001234561',
      role: Role.PATIENT,
    },
    {
      id: '10000000-0000-4000-8000-000000000002',
      phone: '+923001234562',
      role: Role.DOCTOR,
    },
    {
      id: '10000000-0000-4000-8000-000000000003',
      phone: '+923001234563',
      role: Role.PHARMACIST,
    },
    {
      id: '10000000-0000-4000-8000-000000000004',
      phone: '+923001234564',
      role: Role.SUPER_ADMIN,
    },
    {
      id: '10000000-0000-4000-8000-000000000005',
      phone: '+923001234565',
      role: Role.PATIENT,
    },
  ];
  const doctorId = '20000000-0000-4000-8000-000000000001';
  const patientId = '30000000-0000-4000-8000-000000000001';
  const pharmacistId = '40000000-0000-4000-8000-000000000001';
  const tomorrow = new Date(Date.now() + 86400000);
  tomorrow.setUTCHours(9, 0, 0, 0);
  const yesterday = new Date(Date.now() - 86400000);
  yesterday.setUTCHours(9, 0, 0, 0);
  try {
    await db.$transaction(
      async (tx) => {
        // Reserved fixture identities; do not take over an existing real account.
        for (const account of accounts) {
          const existing = await tx.user.findFirst({
            where: { OR: [{ phone: account.phone }, { id: account.id }] },
          });
          if (
            existing &&
            (existing.id !== account.id ||
              existing.phone !== account.phone ||
              existing.role !== account.role)
          )
            throw new Error(
              'Seed identity conflicts with an existing account: ' +
                account.phone,
            );
          await tx.user.upsert({
            where: { id: account.id },
            create: { ...account, isVerified: true },
            update: {},
          });
        }
        await tx.patientProfile.upsert({
          where: { userId: accounts[0].id },
          create: { id: patientId, userId: accounts[0].id },
          update: {},
        });
        await tx.patientProfile.upsert({
          where: { userId: accounts[4].id },
          create: {
            id: '30000000-0000-4000-8000-000000000002',
            userId: accounts[4].id,
          },
          update: {},
        });
        await tx.doctorProfile.upsert({
          where: { userId: accounts[1].id },
          create: {
            id: doctorId,
            userId: accounts[1].id,
            specialty: 'General Medicine (Demo)',
            fees: 1500,
            slotDuration: 30,
            maxPatientsPerSlot: 2,
            isApproved: true,
          },
          update: {},
        });
        await tx.pharmacistProfile.upsert({
          where: { userId: accounts[2].id },
          create: {
            id: pharmacistId,
            userId: accounts[2].id,
            pharmacyName: 'Demo Pharmacy',
          },
          update: {},
        });
        await tx.$queryRaw`SELECT id FROM "DoctorProfile" WHERE id = CAST(${doctorId} AS uuid) FOR UPDATE`;
        for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++)
          await tx.availability.upsert({
            where: { doctorId_dayOfWeek: { doctorId, dayOfWeek } },
            create: {
              doctorId,
              dayOfWeek,
              startTime: '09:00',
              endTime: '17:00',
              isOpen: true,
            },
            update: {},
          });
        // A past consultation permits testing prescription creation; a cancelled future
        // fixture permits testing lists without consuming capacity or changing schedules.
        await tx.appointment.upsert({
          where: { id: '60000000-0000-4000-8000-000000000001' },
          create: {
            id: '60000000-0000-4000-8000-000000000001',
            doctorId,
            patientId,
            slotTime: yesterday,
            status: 'CONFIRMED',
          },
          update: {},
        });
        await tx.appointment.upsert({
          where: { id: '60000000-0000-4000-8000-000000000002' },
          create: {
            id: '60000000-0000-4000-8000-000000000002',
            doctorId,
            patientId,
            slotTime: tomorrow,
            status: 'CANCELLED',
          },
          update: {},
        });
        await tx.bill.upsert({
          where: { id: '70000000-0000-4000-8000-000000000001' },
          create: {
            id: '70000000-0000-4000-8000-000000000001',
            pharmacistId,
            patientName: 'Demo Patient',
            totalAmount: 250.5,
            paymentMethod: 'CASH',
          },
          update: {},
        });
        await tx.bill.upsert({
          where: { id: '70000000-0000-4000-8000-000000000002' },
          create: {
            id: '70000000-0000-4000-8000-000000000002',
            pharmacistId,
            patientName: 'Second Demo Patient',
            totalAmount: 500,
            paymentMethod: 'QR',
            paymentStatus: 'PAID',
            deliveryStatus: 'DELIVERED',
          },
          update: {},
        });
        await tx.prescription.upsert({
          where: { id: '80000000-0000-4000-8000-000000000001' },
          create: {
            id: '80000000-0000-4000-8000-000000000001',
            doctorId,
            patientId,
            medicines: [
              {
                name: 'Demo medicine',
                dosage: 'Test only',
                frequency: 'Test only',
                duration: 'Test only',
              },
            ],
            notes: 'Synthetic fixture; not for clinical use',
          },
          update: {},
        });
      },
      { timeout: 20000 },
    );
    console.table(accounts.map(({ phone, role }) => ({ phone, role })));
    console.log(
      'Seed complete. Existing fixtures were preserved. Send OTP, then verify using DEV_FIXED_OTP (default 123456).',
    );
    console.log(
      'Doctor profile:',
      doctorId,
      'Patient profile:',
      patientId,
      'Slots date:',
      tomorrow.toISOString().slice(0, 10),
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Seed failed');
  process.exitCode = 1;
});
