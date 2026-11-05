import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DoctorAdminDto, ReportQueryDto, UserStatusDto } from './admin.dto';

@Injectable()
export class AdminService {
  constructor(private db: PrismaService) {}
  async dashboard() {
    const [doctors, patients, pharmacists, appointments, recentDoctors] = await Promise.all([
      this.db.doctorProfile.count(), this.db.patientProfile.count(), this.db.pharmacistProfile.count(),
      this.db.appointment.count(),
      this.db.doctorProfile.findMany({ include: { user: { select: { name: true, phone: true } } }, orderBy: { user: { createdAt: 'desc' } }, take: 10 }),
    ]);
    return { totals: { doctors, patients, medicalStores: pharmacists, appointments }, revenue: null, recentDoctors };
  }
  doctors() { return this.db.doctorProfile.findMany({ include: { user: { select: { id: true, name: true, phone: true, isVerified: true } } }, orderBy: { id: 'asc' } }); }
  async updateDoctor(id: string, dto: DoctorAdminDto) { const d = await this.db.doctorProfile.findUnique({ where: { id } }); if (!d) throw new NotFoundException('Doctor not found'); return this.db.doctorProfile.update({ where: { id }, data: dto }); }
  async blockUser(id: string, dto: UserStatusDto) { const user = await this.db.user.findUnique({ where: { id } }); if (!user) throw new NotFoundException('User not found'); return this.db.user.update({ where: { id }, data: dto, select: { id: true, phone: true, role: true, isVerified: true } }); }
  patients(search?: string) { return this.db.patientProfile.findMany({ where: search ? { user: { OR: [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }] } } : undefined, include: { user: { select: { id: true, name: true, phone: true, isVerified: true } } }, orderBy: { id: 'asc' } }).then(rows => rows.map(({ user, ...profile }) => ({ ...user, ...profile }))); }
  reports(q: ReportQueryDto) { const where: any = {}; if (q.from || q.to) where.slotTime = { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) }; return this.db.appointment.findMany({ where, include: { patient: { include: { user: { select: { name: true, phone: true } } } }, doctor: { include: { user: { select: { name: true } } } } }, orderBy: { slotTime: 'desc' } }); }
}
