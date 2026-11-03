import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { Role } from '@prisma/client';
export class SendOtpDto {
  @Matches(/^\+[1-9]\d{7,14}$/)
  @ApiProperty({ example: '+923001234561' })
  phone: string;
}
export class VerifyOtpDto extends SendOtpDto {
  @Matches(/^\d{6}$/) @ApiProperty({ example: '123456' }) otp: string;
}
export class RegisterDto {
  @IsString()
  @Length(64, 64)
  @ApiProperty({
    description: 'Token returned by verify-otp for a NEW phone',
    minLength: 64,
    maxLength: 64,
  })
  registrationToken: string;
  @IsEnum(Role) @ApiProperty({ enum: Role, example: 'PATIENT' }) role: Role;
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsInt() @Min(0) @Max(130) age?: number;
  @IsOptional() @IsString() @Length(1, 40) gender?: string;
  @IsOptional() @IsString() @MaxLength(2000) allergies?: string;
  @IsOptional()
  @IsString()
  @Length(1, 120)
  @ApiPropertyOptional({ example: 'Demo Pharmacy' })
  pharmacyName?: string;
  @IsOptional()
  @IsString()
  @MaxLength(256)
  @ApiPropertyOptional({
    description: 'Required only when registering SUPER_ADMIN',
  })
  adminInviteSecret?: string;
}
