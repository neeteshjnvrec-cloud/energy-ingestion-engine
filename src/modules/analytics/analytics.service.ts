import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MeterTelemetry } from '../telemetry/entities/meter-telemetry.entity';
import { VehicleTelemetry } from '../telemetry/entities/vehicle-telemetry.entity';

export interface PerformanceMetrics {
  vehicleId: string;
  timeRange: {
    start: string;
    end: string;
  };
  energyMetrics: {
    totalAcConsumed: number;
    totalDcDelivered: number;
    efficiencyRatio: number;
    efficiencyPercentage: number;
    powerLoss: number;
  };
  batteryMetrics: {
    averageTemp: number;
    minTemp: number;
    maxTemp: number;
    readingsCount: number;
  };
  dataPoints: number;
  verdict: string;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly EFFICIENCY_THRESHOLD = 0.85; // 85% efficiency threshold

  constructor(
    @InjectRepository(MeterTelemetry)
    private meterTelemetryRepo: Repository<MeterTelemetry>,
    
    @InjectRepository(VehicleTelemetry)
    private vehicleTelemetryRepo: Repository<VehicleTelemetry>,
  ) {}

  /**
   * Get 24-hour performance analytics for a vehicle
   * This query is optimized to use partitioned indexes and avoid full table scans
   */
  async getVehiclePerformance(vehicleId: string): Promise<PerformanceMetrics> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

    this.logger.debug(
      `Fetching performance data for ${vehicleId} from ${startTime.toISOString()} to ${endTime.toISOString()}`,
    );

    // Extract device number from vehicle ID for meter correlation
    // Example: "vehicle_001" -> "001"
    const deviceNumber = this.extractDeviceNumber(vehicleId);
    const meterId = `meter_${deviceNumber}`;

    // Query vehicle telemetry with time-range index
    // This uses the composite index (vehicle_id, recorded_at) and partition pruning
    const vehicleData = await this.vehicleTelemetryRepo
      .createQueryBuilder('vt')
      .select([
        'SUM(vt.kwh_delivered_dc) as total_dc_delivered',
        'AVG(vt.battery_temp) as avg_battery_temp',
        'MIN(vt.battery_temp) as min_battery_temp',
        'MAX(vt.battery_temp) as max_battery_temp',
        'COUNT(*) as data_points',
      ])
      .where('vt.vehicle_id = :vehicleId', { vehicleId })
      .andWhere('vt.recorded_at BETWEEN :startTime AND :endTime', {
        startTime,
        endTime,
      })
      .getRawOne();

    if (!vehicleData || vehicleData.data_points === '0') {
      throw new NotFoundException(
        `No telemetry data found for vehicle ${vehicleId} in the last 24 hours`,
      );
    }

    // Query meter telemetry for correlated meter
    // This also uses the composite index (meter_id, recorded_at) and partition pruning
    const meterData = await this.meterTelemetryRepo
      .createQueryBuilder('mt')
      .select('SUM(mt.kwh_consumed_ac) as total_ac_consumed')
      .where('mt.meter_id = :meterId', { meterId })
      .andWhere('mt.recorded_at BETWEEN :startTime AND :endTime', {
        startTime,
        endTime,
      })
      .getRawOne();

    // Calculate efficiency metrics
    const totalDcDelivered = parseFloat(vehicleData.total_dc_delivered || '0');
    const totalAcConsumed = parseFloat(meterData?.total_ac_consumed || '0');
    
    const efficiencyRatio = totalAcConsumed > 0 
      ? totalDcDelivered / totalAcConsumed 
      : 0;
    
    const efficiencyPercentage = efficiencyRatio * 100;
    const powerLoss = totalAcConsumed - totalDcDelivered;

    // Determine system verdict
    const verdict = this.determineVerdict(efficiencyRatio, powerLoss);

    return {
      vehicleId,
      timeRange: {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
      },
      energyMetrics: {
        totalAcConsumed: this.roundToDecimal(totalAcConsumed, 4),
        totalDcDelivered: this.roundToDecimal(totalDcDelivered, 4),
        efficiencyRatio: this.roundToDecimal(efficiencyRatio, 4),
        efficiencyPercentage: this.roundToDecimal(efficiencyPercentage, 2),
        powerLoss: this.roundToDecimal(powerLoss, 4),
      },
      batteryMetrics: {
        averageTemp: this.roundToDecimal(parseFloat(vehicleData.avg_battery_temp || '0'), 2),
        minTemp: this.roundToDecimal(parseFloat(vehicleData.min_battery_temp || '0'), 2),
        maxTemp: this.roundToDecimal(parseFloat(vehicleData.max_battery_temp || '0'), 2),
        readingsCount: parseInt(vehicleData.data_points, 10),
      },
      dataPoints: parseInt(vehicleData.data_points, 10),
      verdict,
    };
  }

  /**
   * Extract device number from ID for correlation
   * Supports formats like "vehicle_001", "meter_001", etc.
   */
  private extractDeviceNumber(id: string): string {
    const match = id.match(/\d+/);
    return match ? match[0] : id;
  }

  /**
   * Determine system health based on efficiency and power loss
   */
  private determineVerdict(efficiency: number, powerLoss: number): string {
    if (efficiency >= 0.90) {
      return 'Excellent - System operating at peak efficiency';
    } else if (efficiency >= this.EFFICIENCY_THRESHOLD) {
      return 'Good - Normal conversion losses detected';
    } else if (efficiency >= 0.75) {
      return 'Warning - Efficiency below optimal threshold, inspect charging hardware';
    } else if (efficiency > 0) {
      return 'Critical - Significant power loss detected, immediate inspection required';
    } else {
      return 'No Data - Unable to calculate efficiency (missing meter or vehicle data)';
    }
  }

  /**
   * Round numbers to specified decimal places
   */
  private roundToDecimal(num: number, decimals: number): number {
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  /**
   * Get aggregated fleet-wide analytics
   * Useful for dashboard overview
   */
  async getFleetSummary(hours: number = 24): Promise<any> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

    const vehicleSummary = await this.vehicleTelemetryRepo
      .createQueryBuilder('vt')
      .select([
        'COUNT(DISTINCT vt.vehicle_id) as active_vehicles',
        'SUM(vt.kwh_delivered_dc) as total_dc_delivered',
        'AVG(vt.battery_temp) as avg_fleet_temp',
        'COUNT(*) as total_readings',
      ])
      .where('vt.recorded_at BETWEEN :startTime AND :endTime', {
        startTime,
        endTime,
      })
      .getRawOne();

    const meterSummary = await this.meterTelemetryRepo
      .createQueryBuilder('mt')
      .select([
        'COUNT(DISTINCT mt.meter_id) as active_meters',
        'SUM(mt.kwh_consumed_ac) as total_ac_consumed',
        'AVG(mt.voltage) as avg_voltage',
      ])
      .where('mt.recorded_at BETWEEN :startTime AND :endTime', {
        startTime,
        endTime,
      })
      .getRawOne();

    const totalDc = parseFloat(vehicleSummary?.total_dc_delivered || '0');
    const totalAc = parseFloat(meterSummary?.total_ac_consumed || '0');
    const fleetEfficiency = totalAc > 0 ? (totalDc / totalAc) * 100 : 0;

    return {
      timeRange: { start: startTime.toISOString(), end: endTime.toISOString() },
      fleet: {
        activeVehicles: parseInt(vehicleSummary?.active_vehicles || '0', 10),
        activeMeters: parseInt(meterSummary?.active_meters || '0', 10),
        totalReadings: parseInt(vehicleSummary?.total_readings || '0', 10),
      },
      energy: {
        totalAcConsumed: this.roundToDecimal(totalAc, 4),
        totalDcDelivered: this.roundToDecimal(totalDc, 4),
        fleetEfficiency: this.roundToDecimal(fleetEfficiency, 2),
      },
      averages: {
        batteryTemp: this.roundToDecimal(
          parseFloat(vehicleSummary?.avg_fleet_temp || '0'),
          2,
        ),
        voltage: this.roundToDecimal(
          parseFloat(meterSummary?.avg_voltage || '0'),
          2,
        ),
      },
    };
  }
}
