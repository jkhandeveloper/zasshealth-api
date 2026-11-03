import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Module,
  Post,
  Query,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser, Roles } from '../common/security';
import { PageDto } from '../common/dto';
import { BookDto, CancelDto } from './appointments.dto';
import { AppointmentsService } from './appointments.service';
@ApiTags('Appointments')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(private appointments: AppointmentsService) {}
  @Post('book') @Roles('PATIENT') book(
    @CurrentUser() user: User,
    @Body() dto: BookDto,
  ) {
    return this.appointments.book(user.id, dto);
  }
  @Post('cancel') @HttpCode(200) @Roles('PATIENT') cancel(
    @CurrentUser() user: User,
    @Body() dto: CancelDto,
  ) {
    return this.appointments.cancel(user.id, dto.appointmentId);
  }
  @Get('list') @Roles('PATIENT', 'DOCTOR') list(
    @CurrentUser() user: User,
    @Query() page: PageDto,
  ) {
    return this.appointments.list(user.id, page);
  }
}
@Module({
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
