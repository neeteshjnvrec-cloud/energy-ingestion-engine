import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('vehicle_current_state')
export class VehicleCurrentState {
  @PrimaryColumn({ name: 'vehicle_id', type: 'varchar', length: 50 })
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

  @Column({ name: 'last_reading_at', type: 'timestamp with time zone' })
  lastReadingAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
