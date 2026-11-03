import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
export class DoctorProfileDto {
  @IsString()
  @Length(2, 120)
  @ApiProperty({ example: 'General Medicine' })
  specialty: string;
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  @ApiProperty({ example: 1500, minimum: 0 })
  fees: number;
  @IsInt()
  @Min(5)
  @Max(240)
  @ApiProperty({ example: 30, minimum: 5, maximum: 240 })
  slotDuration: number;
  @IsInt()
  @Min(1)
  @Max(100)
  @ApiProperty({ example: 2, minimum: 1, maximum: 100 })
  maxPatientsPerSlot: number;
}
export class AvailabilityDayDto {
  @IsInt()
  @Min(0)
  @Max(6)
  @ApiProperty({
    example: 1,
    minimum: 0,
    maximum: 6,
    description: 'UTC weekday; Sunday = 0',
  })
  dayOfWeek: number;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @ApiProperty({ example: '09:00' })
  startTime: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @ApiProperty({ example: '17:00' })
  endTime: string;
  @IsBoolean() @ApiProperty({ example: true }) isOpen: boolean;
}
export class AvailabilityDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => AvailabilityDayDto)
  @ApiProperty({ type: () => [AvailabilityDayDto] })
  days: AvailabilityDayDto[];
}
export class SlotsQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @ApiProperty({
    example: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    description: 'UTC date YYYY-MM-DD',
  })
  date: string;
}
export class ApprovalDto {
  @IsBoolean() @ApiProperty({ example: true }) isApproved: boolean;
}
