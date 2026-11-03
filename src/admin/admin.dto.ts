import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
export class DoctorAdminDto { @IsBoolean() isApproved: boolean; }
export class UserStatusDto { @IsBoolean() isVerified: boolean; }
export class ReportQueryDto { @IsOptional() @IsDateString() from?: string; @IsOptional() @IsDateString() to?: string; }
export class CmsPageDto { @IsString() @MaxLength(120) title: string; @IsString() @MaxLength(50000) body: string; }
