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

export class VehicleTelemetryDto {
  @IsNotEmpty()
  @IsString()
  vehicleId: string;

  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  soc: number;

  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  kwhDeliveredDc: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-40) // Battery can operate in extreme cold
  @Max(80) // Safety limit for battery temperature
  batteryTemp?: number;

  @IsNotEmpty()
  @IsDateString()
  timestamp: string;
}

export class BulkVehicleTelemetryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VehicleTelemetryDto)
  readings: VehicleTelemetryDto[];
}
