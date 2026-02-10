import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('vehicle_telemetry')
@Index(['vehicleId', 'recordedAt'])
export class VehicleTelemetry {
  @PrimaryColumn({ type: 'bigint', generated: 'increment' })
  id: number;

  @Column({ name: 'vehicle_id', type: 'varchar', length: 50 })
  vehicleId: string;

  @Column({ name: 'soc', type: 'decimal', precision: 5, scale: 2 })
  soc: number;

  @Column({
    name: 'kwh_delivered_dc',
    type: 'decimal',
    precision: 12,
    scale: 4,
  })
  kwhDeliveredDc: number;

  @Column({
    name: 'battery_temp',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  batteryTemp: number;

  @Column({ name: 'recorded_at', type: 'timestamp with time zone' })
  recordedAt: Date;

  @CreateDateColumn({ name: 'ingested_at', type: 'timestamp with time zone' })
  ingestedAt: Date;
}
