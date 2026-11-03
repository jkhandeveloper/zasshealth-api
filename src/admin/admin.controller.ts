import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { Roles } from '../common/security';
import { AdminService } from './admin.service';
import { DoctorAdminDto, ReportQueryDto, UserStatusDto } from './admin.dto';

@ApiTags('Super Admin') @ApiBearerAuth() @Roles('SUPER_ADMIN') @Controller('admin')
export class AdminController {
  constructor(private admin: AdminService) {}
  @Get('dashboard') dashboard() { return this.admin.dashboard(); }
  @Get('doctors') doctors() { return this.admin.doctors(); }
  @Patch('doctors/:id/approval') approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DoctorAdminDto) { return this.admin.updateDoctor(id, dto); }
  @Patch('users/:id/status') status(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UserStatusDto) { return this.admin.blockUser(id, dto); }
  @Get('patients') patients(@Query('search') search?: string) { return this.admin.patients(search); }
  @Get('appointments/report') report(@Query() query: ReportQueryDto) { return this.admin.reports(query); }
}
@Module({ controllers: [AdminController], providers: [AdminService] }) export class AdminModule {}
