import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { typeOrmConfig } from './config/typeorm.config';
import { TelemetryModule } from './modules/telemetry/telemetry.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';

@Module({
  imports: [
    // Configuration management
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Database connection with optimized pool settings
    TypeOrmModule.forRootAsync({
      useFactory: () => typeOrmConfig,
    }),

    // Schedule management for background tasks
    ScheduleModule.forRoot(),

    // Feature modules
    TelemetryModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
