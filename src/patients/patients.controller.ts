import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Get, Module, Patch, Query } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser, Roles } from '../common/security';
import { PageDto } from '../common/dto';
import { PatientsService } from './patients.service';
import { UpdatePatientDto } from './patients.dto';

@ApiTags('Patients') @ApiBearerAuth() @Roles('PATIENT') @Controller('patients')
export class PatientsController {
  constructor(private patients: PatientsService) {}
  @Get('me') me(@CurrentUser() user: User) { return this.patients.me(user.id); }
  @Patch('me') update(@CurrentUser() user: User, @Body() dto: UpdatePatientDto) { return this.patients.update(user.id, dto); }
  @Get('dashboard') dashboard(@CurrentUser() user: User) { return this.patients.dashboard(user.id); }
  @Get('appointments') appointments(@CurrentUser() user: User, @Query() page: PageDto) { return this.patients.appointments(user.id, page); }
  @Get('prescriptions') prescriptions(@CurrentUser() user: User, @Query() page: PageDto) { return this.patients.prescriptions(user.id, page); }
}
@Module({ controllers: [PatientsController], providers: [PatientsService] }) export class PatientsModule {}
