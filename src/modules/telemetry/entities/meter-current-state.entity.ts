import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('meter_current_state')
export class MeterCurrentState {
  @PrimaryColumn({ name: 'meter_id', type: 'varchar', length: 50 })
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

  @Column({ name: 'last_reading_at', type: 'timestamp with time zone' })
  lastReadingAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
