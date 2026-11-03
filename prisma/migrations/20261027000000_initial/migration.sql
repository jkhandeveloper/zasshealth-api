-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PATIENT', 'DOCTOR', 'PHARMACIST', 'ADMIN');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('QR', 'CASH');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'OUT_FOR_DELIVERY', 'DELIVERED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "specialty" TEXT NOT NULL,
    "fees" DECIMAL(12,2) NOT NULL,
    "slotDuration" INTEGER NOT NULL DEFAULT 30,
    "maxPatientsPerSlot" INTEGER NOT NULL DEFAULT 1,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DoctorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "PatientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacistProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "pharmacyName" TEXT NOT NULL,

    CONSTRAINT "PharmacistProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Availability" (
    "id" UUID NOT NULL,
    "doctorId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "doctorId" UUID NOT NULL,
    "slotTime" TIMESTAMPTZ(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" UUID NOT NULL,
    "pharmacistId" UUID NOT NULL,
    "patientName" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "doctorId" UUID NOT NULL,
    "medicines" JSONB NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "phone" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "sentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "registrationHash" TEXT,
    "registrationExpiresAt" TIMESTAMPTZ(3),

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("phone")
);

-- CreateTable
CREATE TABLE "RequestLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RequestLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorProfile_userId_key" ON "DoctorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProfile_userId_key" ON "PatientProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacistProfile_userId_key" ON "PharmacistProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Availability_doctorId_dayOfWeek_key" ON "Availability"("doctorId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "Appointment_doctorId_slotTime_status_idx" ON "Appointment"("doctorId", "slotTime", "status");

-- CreateIndex
CREATE INDEX "Appointment_patientId_slotTime_idx" ON "Appointment"("patientId", "slotTime");

-- CreateIndex
CREATE INDEX "Bill_pharmacistId_createdAt_idx" ON "Bill"("pharmacistId", "createdAt");

-- CreateIndex
CREATE INDEX "Prescription_patientId_createdAt_idx" ON "Prescription"("patientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OtpChallenge_registrationHash_key" ON "OtpChallenge"("registrationHash");

-- CreateIndex
CREATE INDEX "RequestLimit_expiresAt_idx" ON "RequestLimit"("expiresAt");

-- AddForeignKey
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProfile" ADD CONSTRAINT "PatientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacistProfile" ADD CONSTRAINT "PharmacistProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_pharmacistId_fkey" FOREIGN KEY ("pharmacistId") REFERENCES "PharmacistProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Defense in depth beyond request validation.
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_capacity_check" CHECK ("maxPatientsPerSlot" BETWEEN 1 AND 100), ADD CONSTRAINT "DoctorProfile_duration_check" CHECK ("slotDuration" BETWEEN 5 AND 240), ADD CONSTRAINT "DoctorProfile_fees_check" CHECK (fees >= 0);
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_day_check" CHECK ("dayOfWeek" BETWEEN 0 AND 6), ADD CONSTRAINT "Availability_time_check" CHECK ("startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND (NOT "isOpen" OR "startTime" < "endTime"));
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_amount_check" CHECK ("totalAmount" > 0);
CREATE UNIQUE INDEX "Appointment_confirmed_patient_slot_key" ON "Appointment" ("patientId", "doctorId", "slotTime") WHERE status = 'CONFIRMED';
