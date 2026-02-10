import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { MeterTelemetry } from '../telemetry/entities/meter-telemetry.entity';
import { VehicleTelemetry } from '../telemetry/entities/vehicle-telemetry.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MeterTelemetry,
      VehicleTelemetry,
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
