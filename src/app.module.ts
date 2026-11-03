import { CacheModule } from './cache/cache.module';
import {
  Controller,
  Get,
  Global,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { configuration, SETTINGS } from './config';
import { PrismaModule, PrismaService } from './prisma/prisma.service';
import { JwtGuard, Public, RolesGuard } from './common/security';
import { AuthModule } from './auth/auth.controller';
import { DoctorsModule } from './doctors/doctors.controller';
import { AppointmentsModule } from './appointments/appointments.controller';
import { PharmacistModule } from './pharmacist/pharmacist.controller';
import { PrescriptionsModule } from './prescriptions/prescriptions.controller';
import { PatientsModule } from './patients/patients.controller';
import { AdminModule } from './admin/admin.controller';
@Global()
@Module({
  providers: [{ provide: SETTINGS, useFactory: configuration }],
  exports: [SETTINGS],
})
export class SettingsModule {}
@Controller('health')
class HealthController {
  constructor(private db: PrismaService) {}
  @Public() @Get() async health() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }
}
@Module({
  imports: [
    SettingsModule,
    CacheModule,
    PrismaModule,
    AuthModule,
    DoctorsModule,
    AppointmentsModule,
    PharmacistModule,
    PrescriptionsModule,
    PatientsModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
