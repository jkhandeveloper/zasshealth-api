import { ApiProperty } from '@nestjs/swagger';
import { DeliveryStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsInt, IsNumber, IsString, Length, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
export class BillItemDto {
  @IsString() @Length(1, 120) name: string;
  @IsInt() @Min(1) @Max(100000) quantity: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(9999999999.99) unitPrice: number;
}
export class CreateBillDto {
  @IsString()
  @Length(1, 120)
  @ApiProperty({ example: 'Demo Patient' })
  patientName: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => BillItemDto)
  @ApiProperty({ type: () => [BillItemDto] })
  items: BillItemDto[];
  @IsEnum(PaymentMethod)
  @ApiProperty({ enum: PaymentMethod, example: 'CASH' })
  paymentMethod: PaymentMethod;
}
export class PaymentDto {
  @IsEnum(PaymentStatus)
  @ApiProperty({ enum: PaymentStatus, example: 'PAID' })
  paymentStatus: PaymentStatus;
}
export class DeliveryDto {
  @IsEnum(DeliveryStatus)
  @ApiProperty({ enum: DeliveryStatus, example: 'OUT_FOR_DELIVERY' })
  deliveryStatus: DeliveryStatus;
}
