import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  Get,
  Param,
} from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { MeterTelemetryDto, BulkMeterTelemetryDto } from '../../common/dto/meter-telemetry.dto';
import { VehicleTelemetryDto, BulkVehicleTelemetryDto } from '../../common/dto/vehicle-telemetry.dto';

@Controller('v1/telemetry')
export class TelemetryController {
  private readonly logger = new Logger(TelemetryController.name);

  constructor(private readonly telemetryService: TelemetryService) {}

  /**
   * Single meter reading ingestion
   * POST /v1/telemetry/meter
   */
  @Post('meter')
  @HttpCode(HttpStatus.ACCEPTED)
  async ingestMeterReading(@Body() data: MeterTelemetryDto) {
    this.logger.debug(`Received meter reading from ${data.meterId}`);
    
    await this.telemetryService.ingestMeterTelemetry(data);
    
    return {
      status: 'accepted',
      message: 'Meter telemetry ingested successfully',
      meterId: data.meterId,
      timestamp: data.timestamp,
    };
  }

  /**
   * Single vehicle reading ingestion
   * POST /v1/telemetry/vehicle
   */
  @Post('vehicle')
  @HttpCode(HttpStatus.ACCEPTED)
  async ingestVehicleReading(@Body() data: VehicleTelemetryDto) {
    this.logger.debug(`Received vehicle reading from ${data.vehicleId}`);
    
    await this.telemetryService.ingestVehicleTelemetry(data);
    
    return {
      status: 'accepted',
      message: 'Vehicle telemetry ingested successfully',
      vehicleId: data.vehicleId,
      soc: data.soc,
      timestamp: data.timestamp,
    };
  }

  /**
   * Bulk meter readings ingestion
   * POST /v1/telemetry/meter/bulk
   */
  @Post('meter/bulk')
  @HttpCode(HttpStatus.ACCEPTED)
  async ingestMeterBatch(@Body() data: BulkMeterTelemetryDto) {
    this.logger.log(`Received bulk meter readings: ${data.readings.length} records`);
    
    await this.telemetryService.ingestMeterBatch(data.readings);
    
    return {
      status: 'accepted',
      message: 'Bulk meter telemetry ingested successfully',
      count: data.readings.length,
    };
  }

  /**
   * Bulk vehicle readings ingestion
   * POST /v1/telemetry/vehicle/bulk
   */
  @Post('vehicle/bulk')
  @HttpCode(HttpStatus.ACCEPTED)
  async ingestVehicleBatch(@Body() data: BulkVehicleTelemetryDto) {
    this.logger.log(`Received bulk vehicle readings: ${data.readings.length} records`);
    
    await this.telemetryService.ingestVehicleBatch(data.readings);
    
    return {
      status: 'accepted',
      message: 'Bulk vehicle telemetry ingested successfully',
      count: data.readings.length,
    };
  }

  /**
   * Get current meter state
   * GET /v1/telemetry/meter/:meterId/current
   */
  @Get('meter/:meterId/current')
  async getMeterCurrentState(@Param('meterId') meterId: string) {
    const state = await this.telemetryService.getMeterCurrentState(meterId);
    
    if (!state) {
      return {
        meterId,
        status: 'not_found',
        message: 'No data available for this meter',
      };
    }

    return {
      meterId: state.meterId,
      kwhConsumedAc: parseFloat(state.kwhConsumedAc.toString()),
      voltage: parseFloat(state.voltage.toString()),
      lastReadingAt: state.lastReadingAt,
    };
  }

  /**
   * Get current vehicle state
   * GET /v1/telemetry/vehicle/:vehicleId/current
   */
  @Get('vehicle/:vehicleId/current')
  async getVehicleCurrentState(@Param('vehicleId') vehicleId: string) {
    const state = await this.telemetryService.getVehicleCurrentState(vehicleId);
    
    if (!state) {
      return {
        vehicleId,
        status: 'not_found',
        message: 'No data available for this vehicle',
      };
    }

    return {
      vehicleId: state.vehicleId,
      soc: parseFloat(state.soc.toString()),
      kwhDeliveredDc: parseFloat(state.kwhDeliveredDc.toString()),
      batteryTemp: state.batteryTemp ? parseFloat(state.batteryTemp.toString()) : null,
      lastReadingAt: state.lastReadingAt,
    };
  }
}
