import {
  Controller,
  Get,
  Param,
  Query,
  Logger,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('v1/analytics')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Get 24-hour performance metrics for a specific vehicle
   * GET /v1/analytics/performance/:vehicleId
   * 
   * This endpoint demonstrates:
   * - No full table scans (uses partitioned indexes)
   * - Efficient aggregation queries
   * - Correlation between meter and vehicle data
   */
  @Get('performance/:vehicleId')
  async getVehiclePerformance(@Param('vehicleId') vehicleId: string) {
    this.logger.log(`Performance analysis requested for ${vehicleId}`);
    
    const startTime = Date.now();
    const metrics = await this.analyticsService.getVehiclePerformance(vehicleId);
    const queryTime = Date.now() - startTime;

    this.logger.log(
      `Performance analysis completed in ${queryTime}ms for ${vehicleId}`,
    );

    return {
      ...metrics,
      meta: {
        queryTimeMs: queryTime,
        message: 'Data retrieved from partitioned historical tables',
      },
    };
  }

  /**
   * Get fleet-wide summary statistics
   * GET /v1/analytics/fleet/summary?hours=24
   */
  @Get('fleet/summary')
  async getFleetSummary(
    @Query('hours', new DefaultValuePipe(24), ParseIntPipe) hours: number,
  ) {
    this.logger.log(`Fleet summary requested for last ${hours} hours`);
    
    const summary = await this.analyticsService.getFleetSummary(hours);
    
    return summary;
  }
}
