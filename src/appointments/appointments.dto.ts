import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsUUID, Matches } from 'class-validator';
export class BookDto {
  @IsUUID()
  @ApiProperty({
    format: 'uuid',
    example: '20000000-0000-4000-8000-000000000001',
  })
  doctorId: string;
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  @ApiProperty({
    format: 'date-time',
    description:
      'Copy a future slotTime from doctors/:id/slots, including Z or timezone offset',
  })
  slotTime: string;
  @IsOptional() @IsISO8601({ strict: true }) @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  startsAt?: string;
}
export class CancelDto {
  @IsUUID()
  @ApiProperty({
    format: 'uuid',
    description: 'ID returned by book or appointments/list',
  })
  appointmentId: string;
}
