import { IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

export class UpdatePatientDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsInt() @Min(0) @Max(130) age?: number;
  @IsOptional() @IsString() @Length(1, 40) gender?: string;
  @IsOptional() @IsString() @MaxLength(2000) allergies?: string;
}
