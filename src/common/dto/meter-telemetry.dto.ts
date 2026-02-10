import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsDateString,
  Min,
  Max,
  IsOptional,
  IsArray,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MeterTelemetryDto {
  @IsNotEmpty()
  @IsString()
  meterId: string;

  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  kwhConsumedAc: number;

  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000) // Reasonable voltage limit
  voltage: number;

  @IsNotEmpty()
  @IsDateString()
  timestamp: string;
}

export class BulkMeterTelemetryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MeterTelemetryDto)
  readings: MeterTelemetryDto[];
}
