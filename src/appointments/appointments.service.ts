import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildSlots } from '../doctors/slots';
import { BookDto } from './appointments.dto';
import { PageDto } from '../common/dto';
import type { User } from '@prisma/client';
@Injectable()
export class AppointmentsService {
  constructor(private db: PrismaService) {}
  async book(userId: string, dto: BookDto) {
    const slotTime = new Date(dto.slotTime ?? dto.startsAt!);
    const patient = await this.db.patientProfile.findUnique({
      where: { userId },
    });
    if (!patient) throw new NotFoundException('Patient profile not found');
    return this.db.$transaction(
      async (tx) => {
        // PostgreSQL READ COMMITTED takes a new snapshot after acquiring this lock.
        // All booking/cancellation/schedule writers acquire it before reading capacity.
        await this.db.lockDoctor(tx, dto.doctorId);
        const doctor = await tx.doctorProfile.findFirst({
          where: {
            id: dto.doctorId,
            isApproved: true,
            user: { isVerified: true },
          },
          include: { availability: true },
        });
        if (!doctor) throw new NotFoundException('Approved doctor not found');
        if (
          !Number.isFinite(slotTime.getTime()) ||
          slotTime.getTime() <= Date.now()
        )
          throw new BadRequestException('Choose a future slot');
        const day = doctor.availability.find(
          (d) => d.isOpen && d.dayOfWeek === slotTime.getUTCDay(),
        );
        if (
          !day ||
          !buildSlots(
            slotTime.toISOString().slice(0, 10),
            day.startTime,
            day.endTime,
            doctor.slotDuration,
          ).some((s) => s.getTime() === slotTime.getTime())
        )
          throw new BadRequestException(
            'Time is outside the doctor slot schedule',
          );
        const where = {
          doctorId: doctor.id,
          slotTime,
          status: 'CONFIRMED' as const,
        };
        if (
          await tx.appointment.findFirst({
            where: { ...where, patientId: patient.id },
          })
        )
          throw new ConflictException('You already booked this slot');
        if (
          (await tx.appointment.count({ where })) >= doctor.maxPatientsPerSlot
        )
          throw new ConflictException('Slot is full');
        return tx.appointment.create({
          data: { doctorId: doctor.id, patientId: patient.id, slotTime },
        });
      },
      { isolationLevel: 'ReadCommitted', maxWait: 10000, timeout: 15000 },
    );
  }
  async cancel(userId: string, appointmentId: string) {
    const own = await this.db.appointment.findFirst({
      where: { id: appointmentId, patient: { userId } },
    });
    if (!own) throw new NotFoundException('Appointment not found');
    return this.db.$transaction(async (tx) => {
      await this.db.lockDoctor(tx, own.doctorId);
      const current = await tx.appointment.findUniqueOrThrow({
        where: { id: own.id },
      });
      if (current.status === 'CANCELLED') return current;
      if (current.slotTime <= new Date())
        throw new ConflictException('Past appointments cannot be cancelled');
      return tx.appointment.update({
        where: { id: own.id },
        data: { status: 'CANCELLED' },
      });
    });
  }
  list(user: User, page: PageDto) {
    return this.db.appointment.findMany({
      where: user.role === 'SUPER_ADMIN' ? {} : { OR: [{ patient: { userId: user.id } }, { doctor: { userId: user.id } }] },
      include: { doctor: { include: { user: { select: { name: true } } } }, patient: { include: { user: { select: { id: true, name: true } } } } },
      orderBy: [{ slotTime: 'desc' }, { id: 'asc' }],
      skip: page.offset,
      take: page.limit,
    });
  }
}
