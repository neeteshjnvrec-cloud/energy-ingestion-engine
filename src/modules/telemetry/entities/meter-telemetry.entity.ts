import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('meter_telemetry')
@Index(['meterId', 'recordedAt'])
export class MeterTelemetry {
  @PrimaryColumn({ type: 'bigint', generated: 'increment' })
  id: number;

  @Column({ name: 'meter_id', type: 'varchar', length: 50 })
  meterId: string;

  @Column({
    name: 'kwh_consumed_ac',
    type: 'decimal',
    precision: 12,
    scale: 4,
  })
  kwhConsumedAc: number;

  @Column({ name: 'voltage', type: 'decimal', precision: 8, scale: 2 })
  voltage: number;

  @Column({ name: 'recorded_at', type: 'timestamp with time zone' })
  recordedAt: Date;

  @CreateDateColumn({ name: 'ingested_at', type: 'timestamp with time zone' })
  ingestedAt: Date;
}
