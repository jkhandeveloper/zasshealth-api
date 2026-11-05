import { CacheService } from '../cache/cache.module';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PageDto } from '../common/dto';
import { AvailabilityDto, DoctorProfileDto } from './doctors.dto';
import { buildSlots, dateBounds } from './slots';
@Injectable()
export class DoctorsService {
  constructor(
    private db: PrismaService,
    private cache: CacheService,
  ) {}
  async own(userId: string) {
    const doctor = await this.db.doctorProfile.findUnique({
      where: { userId },
    });
    if (!doctor) throw new NotFoundException('Doctor profile not found');
    return doctor;
  }
  async me(userId: string) {
    const doctor = await this.db.doctorProfile.findUnique({ where: { userId }, include: { user: { select: { id: true, name: true, phone: true, isVerified: true } }, availability: { orderBy: { dayOfWeek: 'asc' } } } });
    if (!doctor) throw new NotFoundException('Doctor profile not found');
    return doctor;
  }
  async dashboard(userId: string) {
    const doctor = await this.own(userId);
    const today = new Date();
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const end = new Date(start.getTime() + 86400000);
    const [todayAppointments, totalPatients, upcoming] = await Promise.all([
      this.db.appointment.count({ where: { doctorId: doctor.id, status: 'CONFIRMED', slotTime: { gte: start, lt: end } } }),
      this.db.appointment.findMany({ where: { doctorId: doctor.id }, distinct: ['patientId'], select: { patientId: true } }).then((rows) => rows.length),
      this.db.appointment.findMany({ where: { doctorId: doctor.id, status: 'CONFIRMED', slotTime: { gte: new Date() } }, include: { patient: { include: { user: { select: { name: true, phone: true } } } } }, orderBy: { slotTime: 'asc' }, take: 20 }),
    ]);
    return { totals: { todayAppointments, totalPatients }, upcomingAppointments: upcoming };
  }
  private async requireNoBookings(
    tx: Prisma.TransactionClient,
    doctorId: string,
  ) {
    if (
      await tx.appointment.count({
        where: { doctorId, status: 'CONFIRMED', slotTime: { gte: new Date() } },
      })
    )
      throw new ConflictException(
        'Cancel future bookings before changing schedule or capacity',
      );
  }
  async update(userId: string, dto: DoctorProfileDto) {
    const own = await this.own(userId);
    const result = await this.db.$transaction(async (tx) => {
      await this.db.lockDoctor(tx, own.id);
      const doctor = await tx.doctorProfile.findUniqueOrThrow({
        where: { id: own.id },
      });
      if (
        doctor.slotDuration !== dto.slotDuration ||
        doctor.maxPatientsPerSlot !== dto.maxPatientsPerSlot
      )
        await this.requireNoBookings(tx, doctor.id);
      return tx.doctorProfile.update({ where: { id: doctor.id }, data: dto });
    });
    await this.cache.invalidate('doctors');
    return result;
  }
  async availability(userId: string, dto: AvailabilityDto) {
    if (new Set(dto.days.map((d) => d.dayOfWeek)).size !== dto.days.length)
      throw new BadRequestException('Duplicate dayOfWeek');
    if (dto.days.some((d) => d.isOpen && d.startTime >= d.endTime))
      throw new BadRequestException(
        'Open hours must end after start on the same UTC day',
      );
    const doctor = await this.own(userId);
    const result = await this.db.$transaction(async (tx) => {
      await this.db.lockDoctor(tx, doctor.id);
      await this.requireNoBookings(tx, doctor.id);
      // Full replacement: omitted days are closed.
      await tx.availability.deleteMany({ where: { doctorId: doctor.id } });
      await tx.availability.createMany({
        data: dto.days.map((day) => ({
          doctorId: doctor.id,
          dayOfWeek: day.dayOfWeek,
          startTime: day.startTime,
          endTime: day.endTime,
          isOpen: day.isOpen,
        })),
      });
      return tx.availability.findMany({
        where: { doctorId: doctor.id },
        orderBy: { dayOfWeek: 'asc' },
      });
    });
    await this.cache.invalidate('doctors');
    return result;
  }
  list(page: PageDto) {
    return this.cache.remember(
      'doctors',
      page.offset + ':' + page.limit,
      30,
      () =>
        this.db.doctorProfile.findMany({
          where: { isApproved: true, user: { isVerified: true } },
          select: {
            id: true,
            specialty: true,
            user: { select: { name: true } },
            fees: true,
            slotDuration: true,
            maxPatientsPerSlot: true,
            availability: true,
          },
          orderBy: { id: 'asc' },
          skip: page.offset,
          take: page.limit,
        }),
    );
  }
  patients() {
    return this.db.patientProfile.findMany({ include: { user: { select: { id: true, name: true, phone: true, role: true } } }, orderBy: { id: 'asc' } })
      .then(rows => rows.map(({ user, ...profile }) => ({ ...user, ...profile })));
  }
  async slots(doctorId: string, date: string) {
    const { start, end } = dateBounds(date);
    const doctor = await this.db.doctorProfile.findFirst({
      where: { id: doctorId, isApproved: true, user: { isVerified: true } },
      include: { availability: true },
    });
    if (!doctor) throw new NotFoundException('Approved doctor not found');
    const day = doctor.availability.find(
      (d) => d.dayOfWeek === start.getUTCDay() && d.isOpen,
    );
    if (!day) return [];
    const bookings = await this.db.appointment.groupBy({
      by: ['slotTime'],
      where: {
        doctorId,
        status: 'CONFIRMED',
        slotTime: { gte: start, lt: end },
      },
      _count: { _all: true },
    });
    const counts = new Map(
      bookings.map((b) => [b.slotTime.getTime(), b._count._all]),
    );
    return buildSlots(date, day.startTime, day.endTime, doctor.slotDuration)
      .filter((s) => s.getTime() > Date.now())
      .map((slotTime) => ({
        slotTime,
        remainingCapacity:
          doctor.maxPatientsPerSlot - (counts.get(slotTime.getTime()) ?? 0),
      }))
      .filter((s) => s.remainingCapacity > 0);
  }
  async approve(id: string, isApproved: boolean) {
    const result = await this.db.$transaction(async (tx) => {
      await this.db.lockDoctor(tx, id);
      if (!(await tx.doctorProfile.findUnique({ where: { id } })))
        throw new NotFoundException('Doctor not found');
      return tx.doctorProfile.update({ where: { id }, data: { isApproved } });
    });
    await this.cache.invalidate('doctors');
    return result;
  }
}
