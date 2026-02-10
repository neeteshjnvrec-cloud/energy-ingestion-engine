import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { MeterTelemetryDto } from '../../common/dto/meter-telemetry.dto';
import { VehicleTelemetryDto } from '../../common/dto/vehicle-telemetry.dto';
import { MeterCurrentState } from './entities/meter-current-state.entity';
import { VehicleCurrentState } from './entities/vehicle-current-state.entity';
import { MeterTelemetry } from './entities/meter-telemetry.entity';
import { VehicleTelemetry } from './entities/vehicle-telemetry.entity';

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(
    @InjectRepository(MeterCurrentState)
    private meterCurrentRepo: Repository<MeterCurrentState>,
    
    @InjectRepository(VehicleCurrentState)
    private vehicleCurrentRepo: Repository<VehicleCurrentState>,
    
    @InjectRepository(MeterTelemetry)
    private meterTelemetryRepo: Repository<MeterTelemetry>,
    
    @InjectRepository(VehicleTelemetry)
    private vehicleTelemetryRepo: Repository<VehicleTelemetry>,
    
    private dataSource: DataSource,
  ) {}

  /**
   * Ingest meter telemetry using dual-path strategy:
   * 1. UPSERT to current state (hot data)
   * 2. INSERT to historical telemetry (cold data)
   */
  async ingestMeterTelemetry(data: MeterTelemetryDto): Promise<void> {
    const startTime = Date.now();
    const recordedDate = new Date(data.timestamp);
    
    try {
      // Ensure partition exists before inserting
      try {
        await this.ensurePartitionExists('meter_telemetry', recordedDate);
      } catch (partitionError: any) {
        this.logger.error(
          `Failed to ensure partition exists: ${partitionError.message}`,
          partitionError.stack,
        );
        // Continue anyway - the insert will fail with a clearer error if partition is missing
      }

      await this.dataSource.transaction(async (transactionalEntityManager) => {
        // HOT PATH: Upsert current state for fast dashboard queries
        await transactionalEntityManager
          .createQueryBuilder()
          .insert()
          .into(MeterCurrentState)
          .values({
            meterId: data.meterId,
            kwhConsumedAc: data.kwhConsumedAc,
            voltage: data.voltage,
            lastReadingAt: recordedDate,
          })
          .orUpdate(
            ['kwh_consumed_ac', 'voltage', 'last_reading_at', 'updated_at'],
            ['meter_id'],
          )
          .execute();

        // COLD PATH: Append-only insert for historical audit trail
        await transactionalEntityManager
          .createQueryBuilder()
          .insert()
          .into(MeterTelemetry)
          .values({
            meterId: data.meterId,
            kwhConsumedAc: data.kwhConsumedAc,
            voltage: data.voltage,
            recordedAt: recordedDate,
          })
          .execute();
      });

      const duration = Date.now() - startTime;
      if (duration > 100) {
        this.logger.warn(
          `Slow meter ingestion: ${duration}ms for ${data.meterId}`,
        );
      }
    } catch (error: any) {
      // If partition error, try creating partition and retry once
      if (
        error.message?.includes('no partition') ||
        error.code === 'P0001' ||
        error.message?.includes('partition')
      ) {
        this.logger.warn(
          `Partition missing for ${recordedDate.toISOString()}, attempting to create and retry`,
        );
        try {
          await this.ensurePartitionExists('meter_telemetry', recordedDate);
          
          // Retry the operation
          await this.dataSource.transaction(async (transactionalEntityManager) => {
            await transactionalEntityManager
              .createQueryBuilder()
              .insert()
              .into(MeterCurrentState)
              .values({
                meterId: data.meterId,
                kwhConsumedAc: data.kwhConsumedAc,
                voltage: data.voltage,
                lastReadingAt: recordedDate,
              })
              .orUpdate(
                ['kwh_consumed_ac', 'voltage', 'last_reading_at', 'updated_at'],
                ['meter_id'],
              )
              .execute();

            await transactionalEntityManager
              .createQueryBuilder()
              .insert()
              .into(MeterTelemetry)
              .values({
                meterId: data.meterId,
                kwhConsumedAc: data.kwhConsumedAc,
                voltage: data.voltage,
                recordedAt: recordedDate,
              })
              .execute();
          });
          this.logger.log(`Successfully ingested after creating partition`);
          return;
        } catch (retryError: any) {
          this.logger.error(
            `Failed to create partition and retry: ${retryError.message}`,
            retryError.stack,
          );
          throw retryError;
        }
      }

      this.logger.error(
        `Failed to ingest meter telemetry for ${data.meterId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Ingest vehicle telemetry using dual-path strategy
   */
  async ingestVehicleTelemetry(data: VehicleTelemetryDto): Promise<void> {
    const startTime = Date.now();
    const recordedDate = new Date(data.timestamp);
    
    try {
      // Ensure partition exists before inserting
      await this.ensurePartitionExists('vehicle_telemetry', recordedDate);

      await this.dataSource.transaction(async (transactionalEntityManager) => {
        // HOT PATH: Upsert current state
        await transactionalEntityManager
          .createQueryBuilder()
          .insert()
          .into(VehicleCurrentState)
          .values({
            vehicleId: data.vehicleId,
            soc: data.soc,
            kwhDeliveredDc: data.kwhDeliveredDc,
            batteryTemp: data.batteryTemp,
            lastReadingAt: recordedDate,
          })
          .orUpdate(
            [
              'soc',
              'kwh_delivered_dc',
              'battery_temp',
              'last_reading_at',
              'updated_at',
            ],
            ['vehicle_id'],
          )
          .execute();

        // COLD PATH: Append-only insert
        await transactionalEntityManager
          .createQueryBuilder()
          .insert()
          .into(VehicleTelemetry)
          .values({
            vehicleId: data.vehicleId,
            soc: data.soc,
            kwhDeliveredDc: data.kwhDeliveredDc,
            batteryTemp: data.batteryTemp,
            recordedAt: recordedDate,
          })
          .execute();
      });

      const duration = Date.now() - startTime;
      if (duration > 100) {
        this.logger.warn(
          `Slow vehicle ingestion: ${duration}ms for ${data.vehicleId}`,
        );
      }
    } catch (error: any) {
      // If partition error, try creating partition and retry once
      if (
        error.message?.includes('no partition') ||
        error.code === 'P0001' ||
        error.message?.includes('partition')
      ) {
        this.logger.warn(
          `Partition missing for ${recordedDate.toISOString()}, attempting to create and retry`,
        );
        await this.ensurePartitionExists('vehicle_telemetry', recordedDate);
        
        // Retry the operation
        await this.dataSource.transaction(async (transactionalEntityManager) => {
          await transactionalEntityManager
            .createQueryBuilder()
            .insert()
            .into(VehicleCurrentState)
            .values({
              vehicleId: data.vehicleId,
              soc: data.soc,
              kwhDeliveredDc: data.kwhDeliveredDc,
              batteryTemp: data.batteryTemp,
              lastReadingAt: recordedDate,
            })
            .orUpdate(
              [
                'soc',
                'kwh_delivered_dc',
                'battery_temp',
                'last_reading_at',
                'updated_at',
              ],
              ['vehicle_id'],
            )
            .execute();

          await transactionalEntityManager
            .createQueryBuilder()
            .insert()
            .into(VehicleTelemetry)
            .values({
              vehicleId: data.vehicleId,
              soc: data.soc,
              kwhDeliveredDc: data.kwhDeliveredDc,
              batteryTemp: data.batteryTemp,
              recordedAt: recordedDate,
            })
            .execute();
        });
        return;
      }

      this.logger.error(
        `Failed to ingest vehicle telemetry for ${data.vehicleId}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Bulk ingestion for batch processing
   * This is more efficient for high-throughput scenarios
   */
  async ingestMeterBatch(readings: MeterTelemetryDto[]): Promise<void> {
    if (!readings || readings.length === 0) return;

    // Ensure partitions exist for all dates in the batch
    const timestamps = readings.map((r) => new Date(r.timestamp));
    await this.ensurePartitionsForBatch('meter_telemetry', timestamps);

    const batchSize = 500;
    const batches = this.chunkArray(readings, batchSize);

    for (const batch of batches) {
      await this.dataSource.transaction(async (transactionalEntityManager) => {
        // Prepare current state data
        const currentStates = batch.map((r) => ({
          meterId: r.meterId,
          kwhConsumedAc: r.kwhConsumedAc,
          voltage: r.voltage,
          lastReadingAt: new Date(r.timestamp),
        }));

        // Prepare historical data
        const telemetryData = batch.map((r) => ({
          meterId: r.meterId,
          kwhConsumedAc: r.kwhConsumedAc,
          voltage: r.voltage,
          recordedAt: new Date(r.timestamp),
        }));

        // Bulk upsert current states (all at once)
        if (currentStates.length > 0) {
          await transactionalEntityManager
            .createQueryBuilder()
            .insert()
            .into(MeterCurrentState)
            .values(currentStates)
            .orUpdate(
              ['kwh_consumed_ac', 'voltage', 'last_reading_at', 'updated_at'],
              ['meter_id'],
            )
            .execute();
        }

        // Bulk insert historical data
        await transactionalEntityManager
          .createQueryBuilder()
          .insert()
          .into(MeterTelemetry)
          .values(telemetryData)
          .execute();
      });
    }

    this.logger.log(`Ingested ${readings.length} meter readings in batch mode`);
  }

  async ingestVehicleBatch(readings: VehicleTelemetryDto[]): Promise<void> {
    if (!readings || readings.length === 0) return;

    // Ensure partitions exist for all dates in the batch
    const timestamps = readings.map((r) => new Date(r.timestamp));
    await this.ensurePartitionsForBatch('vehicle_telemetry', timestamps);

    const batchSize = 500;
    const batches = this.chunkArray(readings, batchSize);

    for (const batch of batches) {
      await this.dataSource.transaction(async (transactionalEntityManager) => {
        const currentStates = batch.map((r) => ({
          vehicleId: r.vehicleId,
          soc: r.soc,
          kwhDeliveredDc: r.kwhDeliveredDc,
          batteryTemp: r.batteryTemp,
          lastReadingAt: new Date(r.timestamp),
        }));

        const telemetryData = batch.map((r) => ({
          vehicleId: r.vehicleId,
          soc: r.soc,
          kwhDeliveredDc: r.kwhDeliveredDc,
          batteryTemp: r.batteryTemp,
          recordedAt: new Date(r.timestamp),
        }));

        // Bulk upsert current states (all at once)
        if (currentStates.length > 0) {
          await transactionalEntityManager
            .createQueryBuilder()
            .insert()
            .into(VehicleCurrentState)
            .values(currentStates)
            .orUpdate(
              [
                'soc',
                'kwh_delivered_dc',
                'battery_temp',
                'last_reading_at',
                'updated_at',
              ],
              ['vehicle_id'],
            )
            .execute();
        }

        // Bulk insert historical data
        await transactionalEntityManager
          .createQueryBuilder()
          .insert()
          .into(VehicleTelemetry)
          .values(telemetryData)
          .execute();
      });
    }

    this.logger.log(`Ingested ${readings.length} vehicle readings in batch mode`);
  }

  /**
   * Get current status of a specific meter
   */
  async getMeterCurrentState(meterId: string): Promise<MeterCurrentState | null> {
    return await this.meterCurrentRepo.findOne({ where: { meterId } });
  }

  /**
   * Get current status of a specific vehicle
   */
  async getVehicleCurrentState(vehicleId: string): Promise<VehicleCurrentState | null> {
    return await this.vehicleCurrentRepo.findOne({ where: { vehicleId } });
  }

  /**
   * Ensure partition exists for a given date
   * Creates partition automatically if it doesn't exist
   */
  private async ensurePartitionExists(
    tableName: 'meter_telemetry' | 'vehicle_telemetry',
    date: Date,
  ): Promise<void> {
    // Extract date part (YYYY-MM-DD) and create start/end timestamps
    const dateStr = date.toISOString().split('T')[0];
    const partitionDate = new Date(dateStr + 'T00:00:00Z');
    const nextDay = new Date(partitionDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Format: meter_telemetry_YYYY_MM_DD or vehicle_telemetry_YYYY_MM_DD
    const partitionName = `${tableName}_${dateStr.replace(/-/g, '_')}`;
    
    // Use DATE format to match the init-db.sql schema (PostgreSQL converts DATE to TIMESTAMP WITH TIME ZONE)
    const startDate = dateStr; // YYYY-MM-DD
    const endDate = nextDay.toISOString().split('T')[0]; // YYYY-MM-DD

    try {
      // Check if partition already exists
      const partitionExists = await this.dataSource.query(
        `SELECT EXISTS (
          SELECT 1 
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = $1 
          AND n.nspname = 'public'
        )`,
        [partitionName],
      );

      if (!partitionExists[0]?.exists) {
        // Use DATE format to match init-db.sql (PostgreSQL auto-converts to TIMESTAMP WITH TIME ZONE)
        // Note: Table and partition names cannot be parameterized, only values can be
        const createQuery = `
          CREATE TABLE IF NOT EXISTS ${partitionName} 
          PARTITION OF ${tableName}
          FOR VALUES FROM ('${startDate}'::date) TO ('${endDate}'::date)
        `;
        this.logger.log(`Creating partition: ${partitionName} for ${startDate} to ${endDate}`);
        await this.dataSource.query(createQuery);
        this.logger.log(`Successfully created partition: ${partitionName}`);
      } else {
        this.logger.debug(`Partition ${partitionName} already exists`);
      }
    } catch (error: any) {
      // Log all errors for debugging
      this.logger.error(
        `Failed to create partition ${partitionName}: ${error.message || error}`,
        error.stack,
      );
      
      // If partition already exists (race condition), that's okay
      if (
        error.code === '42P16' ||
        error.message?.includes('already exists') ||
        error.message?.includes('duplicate') ||
        error.message?.includes('relation') && error.message?.includes('already exists')
      ) {
        this.logger.debug(`Partition ${partitionName} was created by another process`);
        return;
      }
      
      // For other errors, throw so we can retry
      throw error;
    }
  }

  /**
   * Ensure partitions exist for all dates in a batch
   */
  private async ensurePartitionsForBatch(
    tableName: 'meter_telemetry' | 'vehicle_telemetry',
    timestamps: Date[],
  ): Promise<void> {
    const uniqueDates = new Set<string>();
    timestamps.forEach((ts) => {
      const dateStr = ts.toISOString().split('T')[0];
      uniqueDates.add(dateStr);
    });

    await Promise.all(
      Array.from(uniqueDates).map((dateStr) =>
        this.ensurePartitionExists(tableName, new Date(dateStr)),
      ),
    );
  }

  /**
   * Utility to chunk arrays for batch processing
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
