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
import { CurrentUser, Roles } from '../common/security';
import { PageDto } from '../common/dto';
import { CreateBillDto, DeliveryDto, PaymentDto } from './pharmacist.dto';
import { PharmacistService } from './pharmacist.service';
@Roles('PHARMACIST')
@ApiTags('Pharmacist')
@ApiBearerAuth()
@Controller('pharmacist/bills')
export class PharmacistController {
  constructor(private bills: PharmacistService) {}
  @Post() create(@CurrentUser() user: User, @Body() dto: CreateBillDto) {
    return this.bills.create(user.id, dto);
  }
  @Get('list') list(@CurrentUser() user: User, @Query() page: PageDto) {
    return this.bills.list(user.id, page);
  }
  @Patch(':id/payment') payment(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PaymentDto,
  ) {
    return this.bills.update(user.id, id, dto);
  }
  @Patch(':id/delivery') delivery(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeliveryDto,
  ) {
    return this.bills.update(user.id, id, dto);
  }
}
@Module({ controllers: [PharmacistController], providers: [PharmacistService] })
export class PharmacistModule {}
