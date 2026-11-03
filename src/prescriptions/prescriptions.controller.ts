import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Module,
  Post,
  Query,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Roles } from '../common/security';
import { PageDto } from '../common/dto';
class MedicineDto {
  @IsString()
  @Length(1, 120)
  @ApiProperty({ example: 'Demo medicine' })
  name: string;
  @IsString()
  @Length(1, 120)
  @ApiProperty({ example: 'Demo dose; not medical advice' })
  dosage: string;
  @IsString()
  @Length(1, 120)
  @ApiProperty({ example: 'Demo frequency' })
  frequency: string;
  @IsString()
  @Length(1, 120)
  @ApiProperty({ example: 'Demo duration' })
  duration: string;
}
export class PrescriptionDto {
  @IsUUID()
  @ApiProperty({
    format: 'uuid',
    example: '30000000-0000-4000-8000-000000000001',
  })
  patientId: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MedicineDto)
  @ApiProperty({ type: () => [MedicineDto] })
  medicines: MedicineDto[];
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @ApiPropertyOptional({
    example: 'Synthetic test prescription; not for clinical use',
  })
  notes?: string;
}
@ApiTags('Prescriptions')
@ApiBearerAuth()
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private db: PrismaService) {}
  @Post() @Roles('DOCTOR') async create(
    @CurrentUser() user: User,
    @Body() dto: PrescriptionDto,
  ) {
    const own = await this.db.doctorProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!own) throw new ForbiddenException('Doctor profile required');
    return this.db.$transaction(
      async (tx) => {
        // Approval updates use this same lock. Recheck permission after acquiring it.
        await this.db.lockDoctor(tx, own.id);
        const doctor = await tx.doctorProfile.findFirst({
          where: { id: own.id, userId: user.id, isApproved: true },
        });
        if (
          !doctor ||
          !(await tx.appointment.findFirst({
            where: {
              doctorId: doctor.id,
              patientId: dto.patientId,
              status: 'CONFIRMED',
              slotTime: { lte: new Date() },
            },
          }))
        )
          throw new ForbiddenException(
            'An approved doctor with a patient consultation is required',
          );
        return tx.prescription.create({
          data: {
            doctorId: doctor.id,
            patientId: dto.patientId,
            medicines: dto.medicines.map((m) => ({
              name: m.name,
              dosage: m.dosage,
              frequency: m.frequency,
              duration: m.duration,
            })),
            notes: dto.notes,
          },
        });
      },
      { isolationLevel: 'ReadCommitted', maxWait: 10000, timeout: 15000 },
    );
  }

  @Get() @Roles('PATIENT', 'DOCTOR') list(
    @CurrentUser() user: User,
    @Query() page: PageDto,
  ) {
    return this.db.prescription.findMany({
      where:
        user.role === 'PATIENT'
          ? { patient: { userId: user.id } }
          : { doctor: { userId: user.id } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: page.offset,
      take: page.limit,
    });
  }
}
@Module({ controllers: [PrescriptionsController] })
export class PrescriptionsModule {}
