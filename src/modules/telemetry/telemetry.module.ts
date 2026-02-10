import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import { MeterCurrentState } from './entities/meter-current-state.entity';
import { VehicleCurrentState } from './entities/vehicle-current-state.entity';
import { MeterTelemetry } from './entities/meter-telemetry.entity';
import { VehicleTelemetry } from './entities/vehicle-telemetry.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MeterCurrentState,
      VehicleCurrentState,
      MeterTelemetry,
      VehicleTelemetry,
    ]),
  ],
  controllers: [TelemetryController],
  providers: [TelemetryService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
