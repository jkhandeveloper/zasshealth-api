import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PageDto } from '../common/dto';
import { UpdatePatientDto } from './patients.dto';

@Injectable()
export class PatientsService {
  constructor(private db: PrismaService) {}
  private async own(userId: string) {
    const patient = await this.db.patientProfile.findUnique({ where: { userId } });
    if (!patient) throw new NotFoundException('Patient profile not found');
    return patient;
  }
  async me(userId: string) {
    const patient = await this.db.patientProfile.findUnique({
      where: { userId }, include: { user: { select: { id: true, phone: true, name: true, role: true } } },
    });
    if (!patient) throw new NotFoundException('Patient profile not found');
    return patient;
  }
  async update(userId: string, dto: UpdatePatientDto) {
    const patient = await this.own(userId);
    return this.db.$transaction([
      this.db.patientProfile.update({ where: { id: patient.id }, data: { age: dto.age, gender: dto.gender, allergies: dto.allergies } }),
      this.db.user.update({ where: { id: userId }, data: dto.name === undefined ? {} : { name: dto.name.trim() } }),
    ]).then(([profile]) => profile);
  }
  async dashboard(userId: string) {
    const patient = await this.own(userId);
    const [appointments, prescriptions, doctors] = await Promise.all([
      this.db.appointment.findMany({ where: { patientId: patient.id }, include: { doctor: { include: { user: { select: { name: true } } } } }, orderBy: { slotTime: 'asc' }, take: 100 }),
      this.db.prescription.count({ where: { patientId: patient.id } }),
      this.db.doctorProfile.findMany({ where: { isApproved: true, user: { isVerified: true } }, include: { user: { select: { name: true } } }, orderBy: { id: 'asc' }, take: 100 }),
    ]);
    const upcoming = appointments.filter((a) => a.status === 'CONFIRMED' && a.slotTime > new Date());
    return { counts: { appointments: appointments.length, confirmedAppointments: appointments.filter((a) => a.status === 'CONFIRMED').length, prescriptions, upcomingVisits: upcoming.length }, upcomingVisits: upcoming.slice(0, 10), doctors };
  }
  appointments(userId: string, page: PageDto) { return this.db.appointment.findMany({ where: { patient: { userId } }, include: { doctor: { include: { user: { select: { name: true } } } } }, orderBy: [{ slotTime: 'desc' }, { id: 'asc' }], skip: page.offset, take: page.limit }); }
  prescriptions(userId: string, page: PageDto) { return this.db.prescription.findMany({ where: { patient: { userId } }, include: { doctor: { include: { user: { select: { name: true } } } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: page.offset, take: page.limit }); }
}
