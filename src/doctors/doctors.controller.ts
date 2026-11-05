import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser, Public, Roles } from '../common/security';
import { PageDto } from '../common/dto';
import {
  ApprovalDto,
  AvailabilityDto,
  DoctorProfileDto,
  SlotsQueryDto,
} from './doctors.dto';
import { DoctorsService } from './doctors.service';
@ApiTags('Doctors')
@Controller('doctors')
export class DoctorsController {
  constructor(private doctors: DoctorsService) {}
  @Get('me') @ApiBearerAuth() @Roles('DOCTOR') me(@CurrentUser() user: User) { return this.doctors.me(user.id); }
  @Get('dashboard') @ApiBearerAuth() @Roles('DOCTOR') dashboard(@CurrentUser() user: User) { return this.doctors.dashboard(user.id); }
  @Post('profile') @ApiBearerAuth() @Roles('DOCTOR') profile(
    @CurrentUser() user: User,
    @Body() dto: DoctorProfileDto,
  ) {
    return this.doctors.update(user.id, dto);
  }
  @Post('set-availability') @ApiBearerAuth() @Roles('DOCTOR') availability(
    @CurrentUser() user: User,
    @Body() dto: AvailabilityDto,
  ) {
    return this.doctors.availability(user.id, dto);
  }
  @Public() @Get('list') list(@Query() page: PageDto) {
    return this.doctors.list(page);
  }
  @Get('patients') @ApiBearerAuth() @Roles('DOCTOR') patients() { return this.doctors.patients(); }
  @Public() @Get(':id/slots') slots(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: SlotsQueryDto,
  ) {
    return this.doctors.slots(id, dto.date);
  }
  @Patch(':id/approval') @ApiBearerAuth() @Roles('SUPER_ADMIN') approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalDto,
  ) {
    return this.doctors.approve(id, dto.isApproved);
  }
}
@Module({ controllers: [DoctorsController], providers: [DoctorsService] })
export class DoctorsModule {}
